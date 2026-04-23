const CHUNK = 0x4000;

/** Encode `Uint8Array` as base64 in the browser without stack overflow on large buffers. */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(bytes[j]!);
    }
  }
  return btoa(binary);
}

export const INPUT_PCM_RATE = 16_000;
export const OUTPUT_PCM_RATE = 24_000;

/**
 * Resample mono float32 audio from `sourceRate` to `targetRate` (linear interpolation).
 */
export function resampleFloat32(
  input: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (sourceRate === targetRate) {
    return input;
  }
  const outLength = Math.max(
    1,
    Math.floor((input.length * targetRate) / sourceRate)
  );
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = (i * sourceRate) / targetRate;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = srcIndex - i0;
    output[i] = input[i0]! * (1 - t) + input[i1]! * t;
  }
  return output;
}

export function float32ToPcm16LE(float: Float32Array): Int16Array {
  const pcm = new Int16Array(float.length);
  for (let i = 0; i < float.length; i++) {
    const s = Math.max(-1, Math.min(1, float[i]!));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const u8 = new Uint8Array(
    pcm.buffer,
    pcm.byteOffset,
    pcm.byteLength
  ) as unknown as Uint8Array;
  return uint8ToBase64(u8);
}

/**
 * Decode little-endian 16-bit PCM (from API) to float32 in [-1, 1] for `AudioBuffer`.
 */
export function base64Pcm16LEToFloat32(
  b64: string
): { samples: Float32Array; rate: number } {
  const binary = atob(b64);
  const len = binary.length / 2;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const lo = binary.charCodeAt(i * 2) & 0xff;
    const hi = binary.charCodeAt(i * 2 + 1) & 0xff;
    const v = (hi << 8) | lo;
    const s = (v < 0x8000 ? v : v - 0x10000) / 0x8000;
    out[i] = s;
  }
  return { samples: out, rate: OUTPUT_PCM_RATE };
}
