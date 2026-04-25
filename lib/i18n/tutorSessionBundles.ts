import type { TutorUiLocale } from "./tutorLocale";
import { ES_TUTOR_SYSTEM_INSTRUCTION, KO_TUTOR_SYSTEM_INSTRUCTION } from "./tutorSystemInstructions";

export type TutorSessionLocaleBundle = {
  systemInstruction: string;
  finalizeTimedOutUserText: string;
  resumeConversationUserText: string;
  errors: {
    noApiKey: string;
    setupTimeout: string;
    wsError: string;
    connectionClosed: string;
    audioWorklet: string;
    sessionStartFailed: string;
  };
};

const KO_SESSION: TutorSessionLocaleBundle = {
  systemInstruction: KO_TUTOR_SYSTEM_INSTRUCTION,
  finalizeTimedOutUserText:
    "[세션 종료] 타이머가 정확히 0이 되었어. 9살 아이에게 아주 짧고 따뜻한 마무리 인사를 한 번만 하고 대화를 끝내 줘.",
  resumeConversationUserText:
    "[대화 계속] 아이는 아직 옆에 있어. 방금은 안전 때문에 말을 줄였을 수 있어. **지금 바로 음성으로** 한 문장만 말하고, 일상·도덕·예절·상식·자연·우주 중 아이가 좋아할 만한 주제로 자연스럽게 이어가. 여기서 멈추거나 끝내지 마.",
  errors: {
    noApiKey: "NEXT_PUBLIC_GEMINI_API_KEY가 설정되어 있지 않아요.",
    setupTimeout:
      "서버에서 setupComplete를 받지 못했어요. API 키와 모델 이름(NEXT_PUBLIC_GEMINI_LIVE_MODEL)을 확인해 주세요.",
    wsError: "WebSocket 연결 오류가 났어요.",
    connectionClosed: "연결이 닫혔어요.",
    audioWorklet: "오디오 워크릿을 불러오지 못했어요.",
    sessionStartFailed: "세션을 시작할 수 없어요.",
  },
};

const ES_SESSION: TutorSessionLocaleBundle = {
  systemInstruction: ES_TUTOR_SYSTEM_INSTRUCTION,
  finalizeTimedOutUserText:
    "[FIN DE SESIÓN] El temporizador llegó a cero. Despídete del niño (~9 años) con una frase final muy breve y cálida en voz, y termina la conversación.",
  resumeConversationUserText:
    "[SIGUE EN VOZ] El niño sigue ahí. Quizá acabaste de acortar la respuesta por seguridad. **Habla ya en voz** una sola frase y enlace con un tema permitido (vida cotidiana, valores, cortesía, naturaleza, espacio, curiosidades seguras). No cortes la conversación aquí.",
  errors: {
    noApiKey: "Falta NEXT_PUBLIC_GEMINI_API_KEY en la configuración.",
    setupTimeout:
      "No se recibió setupComplete del servidor. Revisa la clave API y el modelo (NEXT_PUBLIC_GEMINI_LIVE_MODEL).",
    wsError: "Error de conexión WebSocket.",
    connectionClosed: "La conexión se cerró.",
    audioWorklet: "No se pudo cargar el worklet de audio.",
    sessionStartFailed: "No se pudo iniciar la sesión.",
  },
};

export function getTutorSessionBundle(locale: TutorUiLocale): TutorSessionLocaleBundle {
  return locale === "es" ? ES_SESSION : KO_SESSION;
}
