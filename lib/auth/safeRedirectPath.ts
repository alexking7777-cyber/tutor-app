/** Valid internal path or `null` (invalid / empty). */
export function safeRedirectPathOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) {
    return null;
  }
  if (t.includes("://") || t.includes("\n") || t.includes("\r")) {
    return null;
  }
  return t;
}

/** Same-origin path only — avoids open redirects after sign-in. */
export function safeRedirectPath(raw: unknown, fallback: string): string {
  return safeRedirectPathOrNull(raw) ?? fallback;
}
