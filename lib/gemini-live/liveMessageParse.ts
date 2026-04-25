/**
 * Normalize Gemini Live WebSocket JSON (camelCase vs snake_case from protobuf JSON).
 */

import type { TranscriptRole } from "./transcriptTypes";

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export function pick<T = unknown>(
  obj: Record<string, unknown>,
  camel: string,
  snake: string
): T | undefined {
  if (camel in obj) {
    return obj[camel] as T;
  }
  if (snake in obj) {
    return obj[snake] as T;
  }
  return undefined;
}

export function isSetupCompleteMessage(obj: Record<string, unknown>): boolean {
  return "setupComplete" in obj || "setup_complete" in obj;
}

/** Returns base64 PCM chunks from a server message (if any). */
export function extractModelAudioBase64Chunks(
  obj: Record<string, unknown>
): string[] {
  const out: string[] = [];
  const serverContent = asRecord(
    pick(obj, "serverContent", "server_content")
  );
  if (!serverContent) {
    return out;
  }
  if (serverContent.interrupted === true) {
    return ["__INTERRUPTED__"];
  }
  const modelTurn = asRecord(
    pick(serverContent, "modelTurn", "model_turn")
  );
  const parts = modelTurn?.parts;
  if (!Array.isArray(parts)) {
    return out;
  }
  for (const part of parts) {
    const pr = asRecord(part);
    if (!pr) {
      continue;
    }
    const inline = asRecord(pick(pr, "inlineData", "inline_data"));
    const data = inline?.data;
    if (typeof data === "string" && data.length > 0) {
      out.push(data);
    }
  }
  return out;
}

export function extractApiErrorText(obj: Record<string, unknown>): string | null {
  const err = asRecord(obj.error);
  if (!err) {
    return null;
  }
  const msg = err.message ?? err.status;
  if (typeof msg === "string") {
    return msg;
  }
  return JSON.stringify(err);
}

/** 모델 턴에 텍스트 파트는 있는데 인라인 오디오는 없는지 (거절·차단 후 텍스트만 올 때). */
export function isModelTextOnlyTurn(obj: Record<string, unknown>): boolean {
  const serverContent = asRecord(
    pick(obj, "serverContent", "server_content")
  );
  if (!serverContent) {
    return false;
  }
  const modelTurn = asRecord(
    pick(serverContent, "modelTurn", "model_turn")
  );
  const parts = modelTurn?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return false;
  }
  let hasText = false;
  let hasAudio = false;
  for (const part of parts) {
    const pr = asRecord(part);
    if (!pr) {
      continue;
    }
    const inl = asRecord(pick(pr, "inlineData", "inline_data"));
    if (typeof inl?.data === "string" && inl.data.length > 0) {
      hasAudio = true;
    }
    if (typeof pr.text === "string" && pr.text.trim().length > 0) {
      hasText = true;
    }
  }
  return hasText && !hasAudio;
}

/** Live 서버 메시지 한 건에서 나온 전사/텍스트 조각(순서대로). */
export type LiveTranscriptFragment = { role: TranscriptRole; text: string };

/**
 * `inputAudioTranscription` / `outputAudioTranscription` 활성화 시 오는 전사와,
 * 텍스트-only 모델 턴의 `modelTurn.parts[].text`를 수집한다.
 */
export function extractLiveTranscriptFragments(
  obj: Record<string, unknown>
): LiveTranscriptFragment[] {
  const out: LiveTranscriptFragment[] = [];
  const push = (role: TranscriptRole, text: unknown) => {
    if (typeof text !== "string") {
      return;
    }
    const t = text.trim();
    if (!t) {
      return;
    }
    out.push({ role, text: t });
  };

  const sc = asRecord(pick(obj, "serverContent", "server_content"));
  const candidates: (Record<string, unknown> | null)[] = [obj, sc];
  for (const base of candidates) {
    if (!base) {
      continue;
    }
    const it = asRecord(pick(base, "inputTranscription", "input_transcription"));
    push("user", it?.text);
    const ot = asRecord(
      pick(base, "outputTranscription", "output_transcription")
    );
    push("model", ot?.text);
  }

  if (sc) {
    const ot = asRecord(
      pick(sc, "outputTranscription", "output_transcription")
    );
    const hasOutputTx =
      typeof ot?.text === "string" && ot.text.trim().length > 0;
    if (!hasOutputTx) {
      const modelTurn = asRecord(
        pick(sc, "modelTurn", "model_turn")
      );
      const parts = modelTurn?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          const pr = asRecord(part);
          push("model", pr?.text);
        }
      }
    }
  }

  return out;
}
