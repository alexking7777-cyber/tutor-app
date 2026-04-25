export type TranscriptRole = "user" | "model";

/** 한 줄(같은 화자의 연속 전사는 세션에서 이어붙인다). */
export type TranscriptLine = {
  role: TranscriptRole;
  text: string;
};
