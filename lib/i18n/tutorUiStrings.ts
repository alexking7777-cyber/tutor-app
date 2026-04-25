import type { TutorUiLocale } from "./tutorLocale";

export type TutorUiStrings = {
  htmlLang: string;
  headerEyebrow: string;
  timerHint: string;
  micAriaConnecting: string;
  micAriaLive: string;
  micAriaOff: string;
  micLabelConnecting: string;
  micLabelLive: string;
  micLabelStart: string;
  reportNoApiKey: string;
  reportNoTranscriptEn: string;
  reportNoTranscriptHeritage: string;
  reportFailed: string;
  sessionNoApiKey: string;
  sessionConnectFailed: string;
  /** Shown when `?child=` is set but the user is not logged in as a parent. */
  curriculumNeedLogin: string;
  curriculumLoading: string;
  curriculumSessionTopic: string;
  /** Logged in but no active curriculum / catalog gap. */
  curriculumNoActive: string;
  tutorNavParent: string;
  tutorNavSignOut: string;
  tutorAccountNote: string;
  tutorNoChildren: string;
  tutorGoParentAddChild: string;
  tutorInvalidChildParam: string;
  tutorWrongChildInUrl: string;
  tutorPickChildTitle: string;
  tutorPickChildHint: string;
  tutorMicBlockedHint: string;
  micLabelBlocked: string;
  tutorMascotCaption: string;
  reportPanel: {
    title: string;
    subtitle: string;
    subtitleBilingual: string;
    tabEnglish: string;
    tabHeritage: string;
    reportSideUnavailable: string;
    close: string;
    closeAria: string;
  };
};

const KO: TutorUiStrings = {
  htmlLang: "ko",
  headerEyebrow: "오늘의 말하기 연습",
  timerHint:
    "약 15분 동안 튜터와 음성으로 대화해요. 00:00이 되면 마무리 인사 후 자연스럽게 종료돼요.",
  micAriaConnecting: "연결 중",
  micAriaLive: "마이크 끄기",
  micAriaOff: "마이크 켜기",
  micLabelConnecting: "연결 중…",
  micLabelLive: "듣고 있어요",
  micLabelStart: "눌러서 시작",
  reportNoApiKey: "API 키가 없어 리포트를 만들 수 없어요.",
  reportNoTranscriptEn:
    "There is no transcript. Turn the microphone on so speech can be transcribed; try again in the next session.",
  reportNoTranscriptHeritage:
    "전사된 대화가 없어요. 마이크를 켠 상태에서 아이와 튜터가 나눈 말이 녹음·전사되어야 리포트를 만들 수 있어요. 다음 세션에서 다시 시도해 주세요.",
  reportFailed: "리포트 생성에 실패했어요.",
  sessionNoApiKey:
    "NEXT_PUBLIC_GEMINI_API_KEY가 비어 있어요. .env.local에 키를 넣은 뒤 개발 서버(npm run dev)를 한 번 재시작해 주세요.",
  sessionConnectFailed: "연결에 실패했어요. 다시 눌러 주세요.",
  curriculumNeedLogin:
    "이 아이 진도를 쓰려면 부모 계정으로 로그인한 뒤, 부모 화면의 튜터 링크로 다시 들어와 주세요.",
  curriculumLoading: "오늘 진도 정보를 불러오는 중…",
  curriculumSessionTopic: "이번 세션 주제",
  curriculumNoActive:
    "활성 커리큘럼이 없거나 레슨 목록이 비어 있어요. 부모 화면에서 등록·설정을 확인해 주세요.",
  tutorNavParent: "부모 화면",
  tutorNavSignOut: "로그아웃",
  tutorAccountNote:
    "튜터는 부모 계정으로만 열 수 있어요. 아래에서 연습할 아이를 고른 뒤 마이크를 켜 주세요. (별도 ‘아이 로그인’ 없음)",
  tutorNoChildren: "등록된 아이가 없어요.",
  tutorGoParentAddChild: "아이 추가하기",
  tutorInvalidChildParam: "주소의 child 값이 올바른 UUID가 아니에요. 부모 화면에서 다시 들어와 주세요.",
  tutorWrongChildInUrl: "이 주소의 아이는 내 가족에 없어요. 부모 화면에서 링크를 다시 눌러 주세요.",
  tutorPickChildTitle: "누구랑 연습할까요?",
  tutorPickChildHint: "아이를 고르면 그 아이의 진도로 튜터가 시작해요.",
  tutorMicBlockedHint: "마이크를 켜려면 먼저 아이를 선택해 주세요.",
  micLabelBlocked: "아이 선택 필요",
  tutorMascotCaption: "튜터 로빈",
  reportPanel: {
    title: "오늘의 학습 리포트",
    subtitle: "방금 종료한 세션을 바탕으로 한 요약이에요.",
    subtitleBilingual: "영어와 한국어 리포트를 전환할 수 있어요.",
    tabEnglish: "English",
    tabHeritage: "한국어",
    reportSideUnavailable: "이 언어 버전은 만들지 못했어요.",
    close: "닫기",
    closeAria: "리포트 닫기",
  },
};

const ES: TutorUiStrings = {
  htmlLang: "es",
  headerEyebrow: "Práctica de habla de hoy",
  timerHint:
    "Habla con el tutor por voz unos 15 minutos. Cuando llegue a 00:00, se cerrará con una despedida breve.",
  micAriaConnecting: "Conectando",
  micAriaLive: "Apagar micrófono",
  micAriaOff: "Encender micrófono",
  micLabelConnecting: "Conectando…",
  micLabelLive: "Te escucho",
  micLabelStart: "Toca para empezar",
  reportNoApiKey: "No hay clave API; no se puede crear el informe.",
  reportNoTranscriptEn:
    "There is no transcript. Turn the microphone on so speech can be transcribed; try again in the next session.",
  reportNoTranscriptHeritage:
    "No hay transcripción. Enciende el micrófono para que se grabe y transcriba la conversación con el tutor. Vuelve a intentarlo en la próxima sesión.",
  reportFailed: "No se pudo crear el informe.",
  sessionNoApiKey:
    "NEXT_PUBLIC_GEMINI_API_KEY está vacía. Pon la clave en .env.local y reinicia el servidor de desarrollo (npm run dev).",
  sessionConnectFailed: "No se pudo conectar. Toca de nuevo.",
  curriculumNeedLogin:
    "Para usar el progreso de este niño, inicia sesión como padre o madre y abre el tutor desde la página de padres.",
  curriculumLoading: "Cargando el tema de hoy…",
  curriculumSessionTopic: "Tema de esta sesión",
  curriculumNoActive:
    "No hay currículo activo o no hay lecciones en el catálogo. Revisa la página de padres.",
  tutorNavParent: "Panel de padres",
  tutorNavSignOut: "Cerrar sesión",
  tutorAccountNote:
    "El tutor solo se abre con la cuenta de padre/madre. Elige al niño o niña y luego enciende el micrófono. (No hay inicio de sesión separado para el niño.)",
  tutorNoChildren: "Todavía no hay niños registrados.",
  tutorGoParentAddChild: "Añadir un niño",
  tutorInvalidChildParam: "El parámetro child de la URL no es un UUID válido. Vuelve desde la página de padres.",
  tutorWrongChildInUrl: "Ese perfil de niño no pertenece a tu hogar. Abre el tutor desde la página de padres.",
  tutorPickChildTitle: "¿Con quién practicamos?",
  tutorPickChildHint: "Al elegir, el tutor usará el progreso de ese niño o niña.",
  tutorMicBlockedHint: "Primero elige a un niño o niña para poder encender el micrófono.",
  micLabelBlocked: "Elige perfil",
  tutorMascotCaption: "Tutor Robin",
  reportPanel: {
    title: "Informe de la sesión",
    subtitle: "Resumen basado en la conversación que acabas de terminar.",
    subtitleBilingual: "Puedes alternar entre inglés y español.",
    tabEnglish: "English",
    tabHeritage: "Español",
    reportSideUnavailable: "No se pudo generar esta versión del informe.",
    close: "Cerrar",
    closeAria: "Cerrar informe",
  },
};

export function getTutorUiStrings(locale: TutorUiLocale): TutorUiStrings {
  return locale === "es" ? ES : KO;
}
