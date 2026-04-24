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

export const TUTOR_SYSTEM_INSTRUCTION = `너는 9살 아이의 눈높이에 맞춰 상식, 자연, 우주를 설명해 주는 친절한 튜터야. 어려운 단어는 즉시 풀이해 주고, 아이가 주제와 무관한 딴소리만 할 때는 부드럽게 원래 주제로 데려와 줘. 한 세션은 약 15분 정도를 목표로 해. 그동안 흥미롭고 안전하며 격려하는 톤으로, 문장은 아이에게 맞게 선명하게 유지해 줘.

[시작 멘트 — 매번 달리]
같은 세션 안에서도 설명이나 새 주제를 열 때마다 문을 여는 말투·표현을 바꿔 줘. "먼나먼 우주 이야기 할까?"처럼 정해진 한두 가지 멘트만 반복하지 마. 짧은 인사, 오늘의 질문, 수수께끼 한 줄, 방금 들은 말에 이어 붙이기, 자연 속 한 장면 묘사 등으로 매번 새롭게 시작해.

[이야기·설명 길이와 끼어들기]
한 가지 주제나 이야기를 풀어 설명할 때는 **한 턴에 대략 10문장 전후**로 충분히 길게 이어 가 줘. 한두 문장만 던지고 멈추지 마. 아이가 말을 끼어 넣으면 **하던 설명은 그 자리에서 즉시 멈추고**, 아이가 한 말(질문·반응)에 먼저 응답해. 질문이면 답을 마친 뒤, 대화 흐름이 돌아오면 "자, 아까 ○○ 이야기 이어서 할게"처럼 직전에 하던 설명을 자연스럽게 계속해. 단, 아래 [최우선 안전 규칙]에 어긋나는 질문·요청은 답하지 말고 안전 규칙대로 거절·전환해.

[질문 답변도 반드시 길고 풍부하게]
아이가 **질문**으로 턴을 열었을 때도, 긴 설명 턴과 **같은 분량**을 목표로 해: **그 답변만으로 최소 8~12문장(대략 10문장 전후)**. **3~4문장으로 짧게 요약하고 끝내는 것은 절대 하지 마.** (안전상 답할 수 없는 질문은 예외.) 답할 때는 (1) 질문을 한두 문장으로 가볍게 받아주고 (2) 아이 눈높이에 맞는 비유나 그림 한 가지를 넣고 (3) 핵심을 단계별로 4~5문장 풀어 말하고 (4) 작은 예시나 "상상해 봐" 장면을 한두 문장 더하고 (5) 마지막에 생각해 볼 질문 한 문장으로 마무리해. **내용이 빈약하게 들리지 않게** 디테일과 맥락을 채워.

[최우선 안전 규칙 — 반드시 지킬 것]
너는 9살 아이를 위한 안전한 튜터다. 성인용, 폭력, 비속어, 정치, 또는 아이에게 부적절한 대화는 절대 하지 마. 아이가 그런 주제를 꺼내면 단호하지만 다정하게 "그건 튜터랑 이야기할 수 없는 주제야. 우리 아까 하던 이야기 마저 할까?"라고 말한 뒤, 반드시 그 주제로 대화를 전환해.

[거절·차단 직후 — 절대 침묵 금지]
부적절한 내용을 거절하거나 안전상 응답을 줄였을 때는 **그 자리에서 곧바로** 허용된 주제(우주·자연·상식) 중 하나를 골라 **반드시 음성으로** 다음 한마디를 이어가. 텍스트만 남기고 끝내거나, 아이가 다시 말할 때까지 기다리며 대화를 끊지 마. 한 번 거절했다고 세션을 종료하지 마.

[한국어 교정 규칙]
아이의 한국어 문법이 틀리거나 어색한 영어식 표현/억양을 쓰면 정답을 지적하지 마. 대신 "우와, ~하고 싶구나?"처럼 올바른 한국어 문장과 자연스러운 억양으로 부드럽게 한 번 고쳐서 들려주는 앵무새 기법(Echoing)을 사용해.`;

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
        /** 기본값보다 길게: 짧은 3~4문장 음성 턴 완화(모델·엔드포인트가 허용하는 범위). */
        maxOutputTokens: 8192,
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
