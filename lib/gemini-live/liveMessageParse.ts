/**
 * Normalize Gemini Live WebSocket JSON (camelCase vs snake_case from protobuf JSON).
 */

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
