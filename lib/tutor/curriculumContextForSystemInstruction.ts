import type { TutorUiLocale } from "@/lib/i18n/tutorLocale";

export type TutorCurriculumContextInput = {
  curriculumTitle: string;
  lessonTitle: string;
  lessonSlug: string;
  sequenceOrder: number;
  /** Short plain text for model + optional UI */
  objectivesSummary: string;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max - 1)}…`;
}

/** Human-readable line for tutor header (same language as session). */
export function buildCurriculumTopicLabel(
  locale: TutorUiLocale,
  input: TutorCurriculumContextInput,
): string {
  if (locale === "es") {
    return `${input.curriculumTitle} · clase ${input.sequenceOrder}: ${input.lessonTitle}`;
  }
  return `${input.curriculumTitle} · ${input.sequenceOrder}차시: ${input.lessonTitle}`;
}

/** Sent as `realtimeInput.text` right after Live setup so the model opens on the lesson (not random chit-chat). */
export function buildCurriculumKickoffUserText(
  locale: TutorUiLocale,
  input: TutorCurriculumContextInput,
): string {
  const lesson = input.lessonTitle.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const course = input.curriculumTitle.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  if (locale === "es") {
    return (
      `[Inicio de sesión · mensaje automático de la app; el niño aún no habla] ` +
      `La lección de hoy es "${lesson}" (currículo: ${course}). El micrófono ya está encendido. ` +
      `Responde **solo en voz** abriendo la práctica de esta lección (si es saludos y cortesía, empieza ya con eso).`
    );
  }
  return (
    `[세션 시작·앱 자동 안내, 아직 아이 말 없음] ` +
    `오늘 수업은 "${lesson}"이야 (커리큘럼: ${course}). 마이크는 방금 켜졌어. ` +
    `**반드시 음성으로** 이 주제로 첫 인사와 첫 연습을 열어 줘. 제목이 인사·예절이면 그걸로 바로 들어가고, 우주·동물 잡담으로 시작하지 마.`
  );
}

/**
 * **Prepended** before the base Live system instruction.
 * Must be explicit: models otherwise follow the long default prompt (random “universe” openings, etc.).
 */
export function buildCurriculumContextBlock(
  locale: TutorUiLocale,
  input: TutorCurriculumContextInput,
): string {
  const obj = truncate(input.objectivesSummary, 1200);
  if (locale === "es") {
    return (
      "[TEMA DE HOY — PRIORIDAD SOBRE EL TEMA DE LA CHARLA]\n" +
      "Lees primero este bloque. Salvo **[Seguridad]** y el protocolo de **pronunciación/entonación** (cuando toque corregir antes de seguir), **todo el contenido hablado** de la sesión (historias, preguntas, juegos de rol, mini-situaciones) debe girar en torno al **título de la lección** y a sus formas de decir.\n\n" +
      "[Obligatorio — primera intervención en voz]\n" +
      "Tu **primera respuesta hablada** tras conectar debe **abrir ya** una escena o práctica ligada al título de la lección (saludos, cortesía, situaciones cotidianas que encajen). **No** empieces con un tema genérico (espacio, naturaleza, adivinanzas sin relación) salvo una frase puente de **máximo una línea** que en la **siguiente frase** aterrice en la lección.\n\n" +
      "[Obligatorio — resto de la sesión]\n" +
      "Cada vuelta larga: vocabulario, ejemplos y role-play deben **reforzar** ese tema. Si el niño divaga, acoge una frase y **vuelve** al tema de la lección. Si el título sugiere \"saludos y cortesía\", practica saludos, presentaciones, por favor/gracias, turnos de palabra, hablar con adultos de confianza, etc.\n\n" +
      `— Currículo: ${input.curriculumTitle}\n` +
      `— Lección (orden ${input.sequenceOrder}, slug \`${input.lessonSlug}\`): **${input.lessonTitle}**\n` +
      (obj.length > 0 ? `— Foco / objetivos (resumen): ${obj}\n` : "") +
      "\n[Convive con el bloque inferior]\n" +
      "Debajo vienen las reglas globales del tutor (seguridad, corrección, longitud de turnos, etc.). **No las contradigas**; cuando no estés en corrección ni en seguridad, el **hilo temático** sigue siendo la lección de arriba.\n"
    );
  }

  return (
    "[오늘의 과 — 대화 주제 최우선]\n" +
    "이 블록을 **먼저** 읽는다. 아래에 이어지는 긴 튜터 규칙(발음·안전·턴 길이 등)과 **동시에** 적용되지만, **대화 내용의 주제와 상황**은 **반드시** 아래에 적힌 **오늘의 과 제목**과 그에 맞는 표현·예절·역할극으로 잡는다.\n\n" +
    "[필수 — 첫 음성 턴]\n" +
    "세션이 열린 뒤 **첫 번째로 보내는 음성 응답**은 **반드시** 오늘의 과 제목과 직접 연결된 장면이나 연습으로 시작한다 (예: 제목이 인사·예절이면 아침 인사, 친구·선생님께 인사, \"안녕하세요/감사합니다/실례합니다\" 상황, 짧은 롤플레이 등). " +
    "우주·동물·수수께끼처럼 **과 제목과 무관한 주제로만** 길게 열지 마라. 꼭 다른 소재를 쓰면 **한 문장 이내** 훅만 쓰고 **바로 다음 문장**에서 오늘의 과로 끌고 와라.\n\n" +
    "[필수 — 이후 모든 턴]\n" +
    "설명·질문·이야기·역할극·교정 예문도 **가능한 한** 오늘의 과 어휘와 상황 안에서 돌려라. 아이가 다른 이야기를 하면 한두 문장 받아준 뒤 **부드럽게 다시** 오늘의 과 연습으로 돌아와라. " +
    "제목에 \"인사\"·\"예절\"이 들어 있으면 그 세션의 **주된 놀이**는 인사·말버릇·차례 지키기·존댓말 연습 등으로 잡아라.\n\n" +
    `— 커리큘럼: ${input.curriculumTitle}\n` +
    `— 오늘의 과 (${input.sequenceOrder}차시, slug \`${input.lessonSlug}\`): **${input.lessonTitle}**\n` +
    (obj.length > 0 ? `— 목표·초점(요약): ${obj}\n` : "") +
    "\n[아래 긴 지시문과의 관계]\n" +
    "이어지는 **[절대 규칙]·안전 규칙·발음·억양 교정**은 그대로 **최우선**이다. 다만 교정·안전 절차에 **걸리지 않는 일반 대화**에서는 **항상** 위의 오늘의 과를 중심으로 말한다. " +
    "아래의 \"시작 멘트는 매번 다르게\"는 **오늘의 과 안에서**만 다양하게 적용하고, 무작위 주제로 새 세상을 펼치지 마라.\n"
  );
}

export function summarizeLessonObjectives(raw: unknown): string {
  if (raw == null) {
    return "";
  }
  if (typeof raw === "string") {
    return truncate(raw, 1500);
  }
  if (Array.isArray(raw)) {
    const parts: string[] = [];
    for (const item of raw) {
      if (typeof item === "string") {
        parts.push(item);
      } else if (item && typeof item === "object" && "text" in item && typeof (item as { text: unknown }).text === "string") {
        parts.push((item as { text: string }).text);
      }
    }
    if (parts.length > 0) {
      return truncate(parts.join(" · "), 1500);
    }
    try {
      return truncate(JSON.stringify(raw), 800);
    } catch {
      return "";
    }
  }
  if (typeof raw === "object") {
    try {
      return truncate(JSON.stringify(raw), 800);
    } catch {
      return "";
    }
  }
  return "";
}
