import {
  asRecord,
  extractApiErrorText,
  extractModelAudioBase64Chunks,
  isModelTextOnlyTurn,
  isSetupCompleteMessage,
  pick,
} from "./liveMessageParse";
import {
  float32ToPcm16LE,
  INPUT_PCM_RATE,
  pcm16ToBase64,
  resampleFloat32,
} from "./pcm";
import { Pcm24kPlayer } from "./playbackQueue";

const DEFAULT_MODEL = "gemini-3.1-flash-live-preview";

export const TUTOR_SYSTEM_INSTRUCTION = `너는 9살 아이의 눈높이에 맞춰 상식, 자연, 우주를 설명해 주는 친절한 튜터야. 어려운 단어는 즉시 풀이해 주고, 아이가 딴소리를 하면 부드럽게 원래 주제로 데려와 줘. 한 세션은 약 15분 정도를 목표로 해. 그동안 흥미롭고 안전하며 격려하는 톤으로, 짧고 선명한 문장으로 말하며, 아이가 끼어들기 쉬운 리듬을 유지해 줘.

[최우선 안전 규칙 — 반드시 지킬 것]
너는 9살 아이를 위한 안전한 튜터다. 성인용, 폭력, 비속어, 정치, 또는 아이에게 부적절한 대화는 절대 하지 마. 아이가 그런 주제를 꺼내면 단호하지만 다정하게 "그건 튜터랑 이야기할 수 없는 주제야. 우리 아까 하던 우주 이야기 마저 할까?"라고 말한 뒤, 반드시 그 주제로 대화를 전환해.

[거절·차단 직후 — 절대 침묵 금지]
부적절한 내용을 거절하거나 안전상 응답을 줄였을 때는 **그 자리에서 곧바로** 허용된 주제(우주·자연·상식) 중 하나를 골라 **반드시 음성으로** 다음 한마디를 이어가. 텍스트만 남기고 끝내거나, 아이가 다시 말할 때까지 기다리며 대화를 끊지 마. 한 번 거절했다고 세션을 종료하지 마.`;

const WS_PATH =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const SETUP_WAIT_MS = 25_000;

export type TutorConnectionStatus = "idle" | "connecting" | "open" | "error";

type MessageHandler = (data: string) => void;

function getWsUrl(apiKey: string): string {
  return `${WS_PATH}?key=${encodeURIComponent(apiKey)}`;
}

/**
 * First client message must be `setup` (not `config`). `responseModalities` lives under `generationConfig`.
 * Live `setup`에는 `safetySettings` 필드가 없어 요청이 거부되므로 넣지 않습니다. 안전은 `TUTOR_SYSTEM_INSTRUCTION`으로 유지합니다.
 * @see https://ai.google.dev/api/live
 */
function buildSetupMessage(modelId: string) {
  return {
    setup: {
      model: `models/${modelId}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
      systemInstruction: {
        parts: [{ text: TUTOR_SYSTEM_INSTRUCTION }],
      },
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

  constructor(
    options: { apiKey: string; model?: string; onLog?: MessageHandler } = {
      apiKey: "",
    }
  ) {
    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || DEFAULT_MODEL;
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

  /**
   * 타이머 00:00 도달 시: 마무리 텍스트를 보낸 뒤 잠시 재생을 기다리고 연결을 닫습니다.
   */
  async finalizeTimedOut(drainMs = 3400): Promise<void> {
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            realtimeInput: {
              text:
                "[세션 종료] 타이머가 정확히 0이 되었어. 9살 아이에게 아주 짧고 따뜻한 마무리 인사를 한 번만 하고 대화를 끝내 줘.",
            },
          })
        );
        await new Promise((r) => setTimeout(r, drainMs));
      }
    } finally {
      this.stop();
    }
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
          text:
            "[대화 계속] 아이는 아직 옆에 있어. 방금은 안전 때문에 말을 줄였을 수 있어. **지금 바로 음성으로** 한 문장만 말하고, 우주·자연·상식 중 아이가 좋아할 만한 주제로 자연스럽게 이어가. 여기서 멈추거나 끝내지 마.",
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
      this.setStatus("error", "NEXT_PUBLIC_GEMINI_API_KEY가 없습니다.");
      return;
    }
    this.setStatus("connecting", null);
    this.lastError = null;
    this.realtimeStarted = false;
    this.lastModelAudioAt = Date.now();
    this.resumeHintsSent = 0;
    this.clearResumeTimers();
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
            reject(
              new Error(
                "서버에서 setupComplete를 받지 못했습니다. API 키·모델 이름(NEXT_PUBLIC_GEMINI_LIVE_MODEL)을 확인해 주세요."
              )
            );
          });
        }, SETUP_WAIT_MS);

        const removeHandshakeListeners = () => {
          ws.removeEventListener("open", onOpen);
          ws.removeEventListener("error", onError);
          ws.removeEventListener("close", onCloseHandshake);
        };

        const onOpen = () => {
          ws.send(JSON.stringify(buildSetupMessage(this.model)));
          this.onLog("setup message sent");
        };

        const onError = () => {
          settleConnect(() => {
            removeHandshakeListeners();
            this.setStatus("error", "WebSocket 연결 오류");
            reject(new Error("WebSocket error"));
          });
        };

        const onCloseHandshake = (ev: CloseEvent) => {
          if (!connectSettled) {
            settleConnect(() => {
              removeHandshakeListeners();
              const reason =
                ev.reason ||
                (ev.code ? `code ${ev.code}` : "연결이 닫혔습니다.");
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
                settleConnect(() => {
                  removeHandshakeListeners();
                  resolve();
                });
              } catch (err) {
                const msg =
                  err instanceof Error
                    ? err.message
                    : "오디오 워크릿을 불러오지 못했습니다.";
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
        e instanceof Error ? e.message : "세션을 시작할 수 없습니다."
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
  }
}
