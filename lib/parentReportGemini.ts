import type { TutorUiLocale } from "@/lib/i18n/tutorLocale";
import type { TranscriptLine } from "@/lib/gemini-live/transcriptTypes";

const REPORT_SYSTEM_EN = `You are an expert in children's language and heritage learning. Analyze the transcript and write a concise **English** session report for parents. Include all of: (1) main topics today, (2) strong words or phrases the child used, (3) grammar, word choice, or accent issues that were corrected or worth practicing, (4) one or two practical tips for next time. Tone: warm, respectful, and clear for busy parents.`;

const REPORT_SYSTEM_KO = `너는 어린이 언어·문화 교육 전문가야. 제공된 대화 전사를 분석해 **한국어**로 학부모에게 보낼 세션 리포트를 작성해 줘. 반드시 포함할 것: (1) 오늘의 대화 주제, (2) 아이가 잘 쓴 단어·표현, (3) 교정이 들어갔거나 연습이 필요한 문법·어휘·억양, (4) 다음 학습을 위한 팁 1~2가지. 말투는 정중하고 따뜻하게.`;

const REPORT_SYSTEM_ES = `Eres experta o experto en educación del lenguaje y la herencia cultural infantil. Analiza la transcripción y redacta un informe de sesión breve en **español** para padres o madres. Debe incluir: (1) temas principales de hoy, (2) palabras o frases que el niño usó bien, (3) gramática, léxico o entonación que se corrigieron o conviene practicar, (4) uno o dos consejos prácticos para la próxima vez. Tono: cálido, respetuoso y claro.`;

const GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";

function formatTranscriptEn(lines: TranscriptLine[]): string {
  return lines
    .map((l) =>
      l.role === "user" ? `[Child] ${l.text}` : `[Tutor] ${l.text}`,
    )
    .join("\n\n");
}

function formatTranscriptKo(lines: TranscriptLine[]): string {
  return lines
    .map((l) =>
      l.role === "user" ? `[아이] ${l.text}` : `[튜터] ${l.text}`,
    )
    .join("\n\n");
}

function formatTranscriptEs(lines: TranscriptLine[]): string {
  return lines
    .map((l) =>
      l.role === "user" ? `[Niño] ${l.text}` : `[Tutor] ${l.text}`,
    )
    .join("\n\n");
}

function pickReportModel(): string {
  return (
    process.env.NEXT_PUBLIC_GEMINI_REPORT_MODEL?.trim() || "gemini-2.5-flash"
  );
}

function extractGenerateContentText(data: unknown): string | null {
  const root = data as Record<string, unknown>;
  const cands = root.candidates;
  if (!Array.isArray(cands) || cands.length === 0) {
    return null;
  }
  const first = cands[0] as Record<string, unknown>;
  const content = first.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return null;
  }
  const texts: string[] = [];
  for (const p of parts) {
    const pr = p as Record<string, unknown>;
    if (typeof pr.text === "string") {
      texts.push(pr.text);
    }
  }
  const joined = texts.join("").trim();
  return joined.length > 0 ? joined : null;
}

async function generateOneReport(params: {
  apiKey: string;
  systemInstruction: string;
  userBody: string;
}): Promise<string> {
  const model = pickReportModel();
  const url = `${GENERATE_URL.replace("{model}", encodeURIComponent(model))}?key=${encodeURIComponent(params.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.systemInstruction }] },
      contents: [
        {
          role: "user",
          parts: [{ text: params.userBody }],
        },
      ],
    }),
  });

  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const err = data as Record<string, unknown>;
    const msg =
      typeof err.error === "object" && err.error !== null
        ? JSON.stringify((err.error as Record<string, unknown>).message ?? err.error)
        : JSON.stringify(data);
    throw new Error(msg || `HTTP ${res.status}`);
  }

  const text = extractGenerateContentText(data);
  if (!text) {
    throw new Error("Model response had no text.");
  }
  return text;
}

export type BilingualParentReport = {
  en: string | null;
  heritage: string | null;
  errorEn: string | null;
  errorHeritage: string | null;
};

/**
 * Builds English + heritage-language parent reports in parallel (same transcript).
 * Uses `NEXT_PUBLIC_GEMINI_API_KEY` (client-side from tutor page).
 */
export async function generateBilingualParentReport(
  apiKey: string,
  lines: TranscriptLine[],
  heritageLocale: TutorUiLocale,
): Promise<BilingualParentReport> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("Missing API key.");
  }

  const userEn =
    lines.length === 0
      ? "(Transcript is empty; still give a short note to parents if possible.)"
      : `Here is the voice tutor session transcript:\n\n${formatTranscriptEn(lines)}`;

  const heritageSystem =
    heritageLocale === "es" ? REPORT_SYSTEM_ES : REPORT_SYSTEM_KO;
  const heritageFormatter =
    heritageLocale === "es" ? formatTranscriptEs : formatTranscriptKo;
  const userHeritageEmpty =
    heritageLocale === "es"
      ? "(La transcripción está vacía; aun así da una nota breve a los padres si es posible.)"
      : "(대화 전사가 비어 있음. 그 경우에도 가능한 범위에서 학부모에게 짧게 안내해 줘.)";
  const userHeritage =
    lines.length === 0
      ? userHeritageEmpty
      : heritageLocale === "es"
        ? `Transcripción de la sesión con el tutor por voz:\n\n${heritageFormatter(lines)}`
        : `다음은 음성 튜터 세션의 대화 전사야:\n\n${heritageFormatter(lines)}`;

  const settled = await Promise.allSettled([
    generateOneReport({
      apiKey: key,
      systemInstruction: REPORT_SYSTEM_EN,
      userBody: userEn,
    }),
    generateOneReport({
      apiKey: key,
      systemInstruction: heritageSystem,
      userBody: userHeritage,
    }),
  ]);

  const enResult = settled[0]!;
  const heritageResult = settled[1]!;

  return {
    en: enResult.status === "fulfilled" ? enResult.value : null,
    heritage: heritageResult.status === "fulfilled" ? heritageResult.value : null,
    errorEn:
      enResult.status === "rejected"
        ? enResult.reason instanceof Error
          ? enResult.reason.message
          : String(enResult.reason)
        : null,
    errorHeritage:
      heritageResult.status === "rejected"
        ? heritageResult.reason instanceof Error
          ? heritageResult.reason.message
          : String(heritageResult.reason)
        : null,
  };
}
