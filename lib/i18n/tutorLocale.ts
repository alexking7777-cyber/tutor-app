export type TutorUiLocale = "ko" | "es";

const CULTURE_TO_LOCALE: Record<string, TutorUiLocale> = {
  "korean-american": "ko",
  korean: "ko",
  "mexican-american": "es",
  hispanic: "es",
  latino: "es",
};

/**
 * Resolves tutor (child) UI + Live session teaching language.
 * Query: `?locale=ko|es` or `?culture=korean-american|mexican-american` (slug from DB).
 * Defaults to Korean (`ko`) for backward compatibility.
 */
export function resolveTutorUiLocale(input: {
  localeParam?: string | null;
  cultureParam?: string | null;
}): TutorUiLocale {
  const loc = input.localeParam?.trim().toLowerCase();
  if (loc === "ko" || loc === "kr") {
    return "ko";
  }
  if (loc === "es" || loc === "mx") {
    return "es";
  }
  const cult = input.cultureParam?.trim().toLowerCase();
  if (cult && CULTURE_TO_LOCALE[cult]) {
    return CULTURE_TO_LOCALE[cult]!;
  }
  if (cult) {
    if (cult.includes("korea")) {
      return "ko";
    }
    if (cult.includes("mexic") || cult.includes("hispanic") || cult.includes("latino")) {
      return "es";
    }
  }
  return "ko";
}
