import {
  asRecord,
  extractApiErrorText,
  extractLiveTranscriptFragments,
  extractModelAudioBase64Chunks,
  isModelTextOnlyTurn,
  isSetupCompleteMessage,
  pick,
} from "./liveMessageParse";
import type { TranscriptLine } from "./transcriptTypes";

export type { TranscriptLine } from "./transcriptTypes";
import {
  float32ToPcm16LE,
  INPUT_PCM_RATE,
  pcm16ToBase64,
  resampleFloat32,
} from "./pcm";
import { Pcm24kPlayer } from "./playbackQueue";
import {
  getTutorSessionBundle,
  type TutorSessionLocaleBundle,
} from "@/lib/i18n/tutorSessionBundles";
import type { TutorUiLocale } from "@/lib/i18n/tutorLocale";

export { KO_TUTOR_SYSTEM_INSTRUCTION as TUTOR_SYSTEM_INSTRUCTION } from "@/lib/i18n/tutorSystemInstructions";

const DEFAULT_MODEL = "gemini-3.1-flash-live-preview";

const WS_PATH =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const SETUP_WAIT_MS = 25_000;

export type TutorConnectionStatus = "idle" | "connecting" | "open" | "error";

type MessageHandler = (data: string) => void;

export type TranscriptChangeHandler = (lines: TranscriptLine[]) => void;

function getWsUrl(apiKey: string): string {
  return `${WS_PATH}?key=${encodeURIComponent(apiKey)}`;
}

/**
 * First client message must be `setup` (not `config`). `responseModalities` lives under `generationConfig`.
 * Live `setup`에는 `safetySettings` 필드가 없어 요청이 거부되므로 넣지 않습니다. 안전은 `systemInstruction` 텍스트로 유지합니다.
 * @see https://ai.google.dev/api/live
 */
function buildSetupMessage(modelId: string, systemInstructionText: string) {
  return {
    setup: {
      model: `models/${modelId}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        /** 기본값보다 길게: 짧은 3~4문장 음성 턴 완화(모델·엔드포인트가 허용하는 범위). */
        maxOutputTokens: 8192,
      },
      systemInstruction: {
        parts: [{ text: systemInstructionText }],
      },
      /** 전사 없이는 부모 리포트용 기록을 만들 수 없어 Live 전용 필드만 추가한다. */
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  };
}

async function messageEventToString(
  event: MessageEvent<string | Blob | ArrayBuffer>
): Promise<string> {
  if (event.data instanceof Blob) {
    return event.data.text();
  }
  if (event.data instanceof ArrayBuffer) {
    return new TextDecoder().decode(event.data);
  }
  return String(event.data);
}

/**
 * One live tutor session: mic → PCM 16k → WebSocket, WebSocket → PCM 24k → speaker.
 * Call `start()` from a user gesture; call `stop()` to release mic and close socket.
 */
export class TutorLiveSession {
  private apiKey: string;
  private model: string;
  private readonly sessionLocale: TutorSessionLocaleBundle;
  /** Base bundle text + optional DB-driven curriculum block (same session). */
  private readonly systemInstructionText: string;
  /** Appended to resume nudges so the model does not jump to unrelated topics mid-session. */
  private readonly resumeHintCurriculumAppend: string;
  /**
   * Optional first `realtimeInput.text` after setup (simulates a user turn) so the model
   * speaks first on the curriculum lesson instead of improvising unrelated openers.
   */
  private readonly sessionKickoffRealtimeText: string | null;
  private ws: WebSocket | null = null;
  private inputCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private inputSampleRate = 48_000;
  private source: MediaStreamAudioSourceNode | null = null;
  private mute: GainNode | null = null;
  private player: Pcm24kPlayer | null = null;
  private onLog: (msg: string) => void;
  public status: TutorConnectionStatus = "idle";
  public lastError: string | null = null;
  /** True after `setupComplete` and input worklet are running. */
  private realtimeStarted = false;
  private lastModelAudioAt = 0;
  private textOnlyResumeTimer: number | null = null;
  private interruptedResumeTimer: number | null = null;
  private resumeHintsSent = 0;
  private static readonly MAX_RESUME_HINTS = 8;

  private transcript: TranscriptLine[] = [];
  private onTranscriptChange?: TranscriptChangeHandler;

  constructor(
    options: {
      apiKey: string;
      model?: string;
      /** Child-facing tutor UI locale (Korean vs Spanish session copy + system prompt). */
      tutorUiLocale?: TutorUiLocale;
      /**
       * Optional block from `/api/tutor-session-context` (active curriculum + current lesson).
       * **Prepended before** the locale base instruction so the model keeps the lesson topic salient.
       */
      curriculumContextBlock?: string;
      /** First realtime text turn after connect; use with curriculum sessions. */
      sessionKickoffRealtimeText?: string;
      onLog?: MessageHandler;
      onTranscriptChange?: TranscriptChangeHandler;
    } = {
      apiKey: "",
    }
  ) {
    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || DEFAULT_MODEL;
    this.sessionLocale = getTutorSessionBundle(options.tutorUiLocale ?? "ko");
    const extra = options.curriculumContextBlock?.trim();
    this.systemInstructionText = extra
      ? `${extra}\n\n---\n\n${this.sessionLocale.systemInstruction}`
      : this.sessionLocale.systemInstruction;
    const loc = options.tutorUiLocale ?? "ko";
    this.resumeHintCurriculumAppend = extra
      ? loc === "es"
        ? " Sigue el tema de la lección de hoy del currículo (p. ej. saludos y cortesía si es el título); no cambies a un tema aleatorio."
        : " 오늘 정한 커리큘럼 그 과(예: 인사·예절) 연습을 이어 가고, 우주·수수께끼 같은 무관한 주제로 새지 마."
      : "";
    const kick = options.sessionKickoffRealtimeText?.trim();
    this.sessionKickoffRealtimeText = kick && kick.length > 0 ? kick : null;
    this.onTranscriptChange = options.onTranscriptChange;
    this.onLog = options.onLog
      ? (m) => options.onLog?.(m)
      : () => {
          // default: no console spam in production UI
        };
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  setModel(m: string): void {
    this.model = m.trim() || DEFAULT_MODEL;
  }

  private setStatus(s: TutorConnectionStatus, err: string | null = null): void {
    this.status = s;
    this.lastError = err;
  }

  /** Playback analyser (모델 음성 출력) — 립싱크용. */
  getPlaybackAnalyser(): AnalyserNode | null {
    return this.player?.getOutputAnalyser() ?? null;
  }

  /** 대화 종료 직전 스냅샷(부모 리포트용). `stop()` 전에 호출할 것. */
  getTranscriptSnapshot(): TranscriptLine[] {
    return this.transcript.map((l) => ({ ...l }));
  }

  private clearTranscript(): void {
    this.transcript = [];
    this.onTranscriptChange?.([]);
  }

  private appendTranscriptFragments(
    fragments: ReturnType<typeof extractLiveTranscriptFragments>
  ): void {
    if (fragments.length === 0) {
      return;
    }
    for (const { role, text } of fragments) {
      const last = this.transcript[this.transcript.length - 1];
      if (last?.role === role) {
        const joiner =
          last.text.length > 0 &&
          !/\s$/.test(last.text) &&
          !/^\s/.test(text)
            ? " "
            : "";
        last.text = `${last.text}${joiner}${text}`;
      } else {
        this.transcript.push({ role, text });
      }
    }
    this.onTranscriptChange?.(this.getTranscriptSnapshot());
  }

  /**
   * 타이머 00:00 도달 시: 마무리 텍스트를 보낸 뒤 잠시 재생을 기다리고 연결을 닫습니다.
   * @returns `stop()` 직전까지 누적된 전사(부모 리포트용).
   */
  async finalizeTimedOut(drainMs = 3400): Promise<TranscriptLine[]> {
    let snapshot: TranscriptLine[] = [];
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            realtimeInput: {
              text: this.sessionLocale.finalizeTimedOutUserText,
            },
          })
        );
        await new Promise((r) => setTimeout(r, drainMs));
      }
    } finally {
      snapshot = this.getTranscriptSnapshot();
      this.stop();
    }
    return snapshot;
  }

  private clearResumeTimers(): void {
    if (this.textOnlyResumeTimer !== null) {
      window.clearTimeout(this.textOnlyResumeTimer);
      this.textOnlyResumeTimer = null;
    }
    if (this.interruptedResumeTimer !== null) {
      window.clearTimeout(this.interruptedResumeTimer);
      this.interruptedResumeTimer = null;
    }
  }

  private sendResumeConversationHint(): void {
    if (this.resumeHintsSent >= TutorLiveSession.MAX_RESUME_HINTS) {
      return;
    }
    if (this.ws?.readyState !== WebSocket.OPEN || !this.realtimeStarted) {
      return;
    }
    this.resumeHintsSent += 1;
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          text: `${this.sessionLocale.resumeConversationUserText}${this.resumeHintCurriculumAppend}`,
        },
      })
    );
    this.onLog("resume hint sent after stall/text-only");
  }

  private scheduleResumeIfTextOnlyOrStalled(obj: Record<string, unknown>): void {
    if (isModelTextOnlyTurn(obj)) {
      this.clearResumeTimers();
      this.textOnlyResumeTimer = window.setTimeout(() => {
        this.textOnlyResumeTimer = null;
        this.sendResumeConversationHint();
      }, 500);
      return;
    }

    const sc = asRecord(pick(obj, "serverContent", "server_content"));
    if (sc?.interrupted === true) {
      this.clearResumeTimers();
      this.interruptedResumeTimer = window.setTimeout(() => {
        this.interruptedResumeTimer = null;
        if (Date.now() - this.lastModelAudioAt > 700) {
          this.sendResumeConversationHint();
        }
      }, 1200);
    }
  }

  private handleServerPayload(obj: Record<string, unknown>): void {
    const pf = asRecord(pick(obj, "promptFeedback", "prompt_feedback"));
    if (
      pf &&
      (typeof pf.blockReason === "string" ||
        typeof pf.block_reason === "string")
    ) {
      this.clearResumeTimers();
      this.textOnlyResumeTimer = window.setTimeout(() => {
        this.textOnlyResumeTimer = null;
        this.sendResumeConversationHint();
      }, 450);
    }

    this.appendTranscriptFragments(extractLiveTranscriptFragments(obj));

    const chunks = extractModelAudioBase64Chunks(obj);
    if (chunks.length === 1 && chunks[0] === "__INTERRUPTED__") {
      this.onLog("interrupted: clearing playback");
      this.player?.clear();
      this.scheduleResumeIfTextOnlyOrStalled(obj);
      return;
    }

    let playedAudio = false;
    for (const b64 of chunks) {
      this.player?.playBase64Pcm16(b64);
      playedAudio = true;
    }
    if (playedAudio) {
      this.lastModelAudioAt = Date.now();
      this.clearResumeTimers();
    }

    this.scheduleResumeIfTextOnlyOrStalled(obj);
  }

  private sendPcm16Chunk(pcm: Int16Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.realtimeStarted) {
      return;
    }
    const b64 = pcm16ToBase64(pcm);
    const msg = {
      realtimeInput: {
        audio: {
          data: b64,
          mimeType: "audio/pcm;rate=16000",
        },
      },
    };
    this.ws.send(JSON.stringify(msg));
  }

  private sendAudioStreamEnd(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }

  private async startAudioInputPipeline(): Promise<void> {
    if (!this.inputCtx || !this.stream) {
      return;
    }
    const ctx = this.inputCtx;
    await ctx.audioWorklet.addModule("/audio-worklets/tutor-mic-processor.js");
    this.source = ctx.createMediaStreamSource(this.stream);
    this.inputSampleRate = ctx.sampleRate;
    this.workletNode = new AudioWorkletNode(ctx, "tutor-mic-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });
    this.workletNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      if (this.ws?.readyState !== WebSocket.OPEN || !this.realtimeStarted) {
        return;
      }
      const chunk = ev.data;
      if (!(chunk instanceof Float32Array) || chunk.length === 0) {
        return;
      }
      const at16k = resampleFloat32(
        chunk,
        this.inputSampleRate,
        INPUT_PCM_RATE
      );
      const pcm = float32ToPcm16LE(at16k);
      this.sendPcm16Chunk(pcm);
    };
    this.mute = ctx.createGain();
    this.mute.gain.value = 0;
    this.source.connect(this.workletNode);
    this.workletNode.connect(this.mute);
    this.mute.connect(ctx.destination);
    this.realtimeStarted = true;
    this.onLog("Realtime mic pipeline started after setupComplete");
  }

  async start(): Promise<void> {
    if (!this.apiKey) {
      this.setStatus("error", this.sessionLocale.errors.noApiKey);
      return;
    }
    this.setStatus("connecting", null);
    this.lastError = null;
    this.realtimeStarted = false;
    this.lastModelAudioAt = Date.now();
    this.resumeHintsSent = 0;
    this.clearResumeTimers();
    this.clearTranscript();
    this.player = new Pcm24kPlayer();

    try {
      await this.player.ensureReady();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: { ideal: INPUT_PCM_RATE },
        },
      });
      this.inputCtx = new AudioContext();
      if (this.inputCtx.state === "suspended") {
        await this.inputCtx.resume();
      }

      this.ws = new WebSocket(getWsUrl(this.apiKey));
      this.ws.binaryType = "arraybuffer";

      await new Promise<void>((resolve, reject) => {
        if (!this.ws) {
          reject(new Error("WebSocket not created"));
          return;
        }
        const ws = this.ws;
        let connectSettled = false;
        let pipelineStarted = false;

        const settleConnect = (fn: () => void) => {
          if (connectSettled) {
            return;
          }
          connectSettled = true;
          window.clearTimeout(timeoutId);
          fn();
        };

        const timeoutId = window.setTimeout(() => {
          settleConnect(() => {
            removeHandshakeListeners();
            reject(new Error(this.sessionLocale.errors.setupTimeout));
          });
        }, SETUP_WAIT_MS);

        const removeHandshakeListeners = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("error", onError);
          ws.removeEventListener("close", onCloseHandshake);
        };

        const onOpen = () => {
          ws.send(
            JSON.stringify(
              buildSetupMessage(this.model, this.systemInstructionText),
            ),
          );
          this.onLog("setup message sent");
        };

        const onError = () => {
          settleConnect(() => {
            removeHandshakeListeners();
            this.setStatus("error", this.sessionLocale.errors.wsError);
            reject(new Error("WebSocket error"));
          });
        };

        const onCloseHandshake = (ev: CloseEvent) => {
          if (!connectSettled) {
            settleConnect(() => {
              removeHandshakeListeners();
              const reason =
                ev.reason ||
                (ev.code ? `code ${ev.code}` : this.sessionLocale.errors.connectionClosed);
              reject(new Error(reason));
            });
          }
        };

        const onMessage = (ev: MessageEvent) => {
          void (async () => {
            let data: string;
            try {
              data = await messageEventToString(ev);
            } catch {
              return;
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(data) as unknown;
            } catch {
              return;
            }
            if (!parsed || typeof parsed !== "object") {
              return;
            }
            const obj = parsed as Record<string, unknown>;

            const apiErr = extractApiErrorText(obj);
            if (apiErr) {
              this.setStatus("error", apiErr);
              settleConnect(() => {
                removeHandshakeListeners();
                reject(new Error(apiErr));
              });
              return;
            }

            if (isSetupCompleteMessage(obj) && !pipelineStarted) {
              pipelineStarted = true;
              try {
                await this.startAudioInputPipeline();
                this.setStatus("open", null);
                if (this.sessionKickoffRealtimeText && ws.readyState === WebSocket.OPEN) {
                  queueMicrotask(() => {
                    if (this.ws?.readyState === WebSocket.OPEN && this.sessionKickoffRealtimeText) {
                      this.ws.send(
                        JSON.stringify({
                          realtimeInput: { text: this.sessionKickoffRealtimeText },
                        }),
                      );
                      this.onLog("curriculum kickoff realtimeInput sent");
                    }
                  });
                }
                settleConnect(() => {
                  removeHandshakeListeners();
                  resolve();
                });
              } catch (err) {
                const msg =
                  err instanceof Error
                    ? err.message
                    : this.sessionLocale.errors.audioWorklet;
                this.setStatus("error", msg);
                settleConnect(() => {
                  removeHandshakeListeners();
                  reject(err instanceof Error ? err : new Error(String(err)));
                });
              }
            }

            this.handleServerPayload(obj);
          })();
        };

        ws.addEventListener("message", onMessage);
        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onError);
        ws.addEventListener("close", onCloseHandshake);
      });

      this.ws.addEventListener("close", (ev) => {
        this.onLog(`WebSocket closed: ${ev.code} ${ev.reason}`);
      });
    } catch (e) {
      this.stop();
      this.setStatus(
        "error",
        e instanceof Error ? e.message : this.sessionLocale.errors.sessionStartFailed,
      );
      throw e;
    }
  }

  stop(): void {
    this.clearResumeTimers();
    this.realtimeStarted = false;
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try {
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // ignore
      }
      this.source = null;
    }
    if (this.mute) {
      try {
        this.mute.disconnect();
      } catch {
        // ignore
      }
      this.mute = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) {
        t.stop();
      }
      this.stream = null;
    }
    if (this.inputCtx) {
      this.inputCtx.close();
      this.inputCtx = null;
    }
    this.sendAudioStreamEnd();
    this.player?.clear();
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.setStatus("idle", null);
    this.player?.close();
    this.player = null;
    this.clearTranscript();
  }
}
