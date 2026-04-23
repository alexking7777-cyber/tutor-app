"use client";

import { useEffect, useState } from "react";

const INITIAL_TIME = 15 * 60;

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export default function Home() {
  const [isMicOn, setIsMicOn] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(INITIAL_TIME);

  useEffect(() => {
    if (!isMicOn || remainingSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isMicOn, remainingSeconds]);

  useEffect(() => {
    if (remainingSeconds === 0) {
      setIsMicOn(false);
    }
  }, [remainingSeconds]);

  const handleMicToggle = () => {
    if (remainingSeconds === 0) {
      setRemainingSeconds(INITIAL_TIME);
      setIsMicOn(true);
      return;
    }
    setIsMicOn((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 via-rose-100 to-sky-100 px-6 py-8">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col items-center rounded-[2.25rem] bg-white/75 p-6 shadow-xl backdrop-blur-sm sm:p-10">
        <header className="w-full rounded-3xl bg-white/80 p-5 shadow-sm">
          <p className="text-center text-sm font-semibold text-rose-500">
            오늘의 말하기 연습
          </p>
          <p className="mt-2 text-center text-5xl font-black tracking-wide text-rose-600">
            {formatTime(remainingSeconds)}
          </p>
        </header>

        <section className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={handleMicToggle}
            className={`relative flex h-64 w-64 items-center justify-center rounded-full border-8 transition-all duration-300 ease-out focus:outline-none focus:ring-4 focus:ring-rose-200 sm:h-80 sm:w-80 ${
              isMicOn
                ? "scale-105 border-rose-300 bg-rose-400 shadow-[0_0_0_14px_rgba(251,113,133,0.2)]"
                : "border-sky-200 bg-sky-300 shadow-[0_0_0_14px_rgba(125,211,252,0.25)]"
            }`}
            aria-pressed={isMicOn}
            aria-label={isMicOn ? "마이크 끄기" : "마이크 켜기"}
          >
            <span className="text-8xl" aria-hidden="true">
              {isMicOn ? "🎙️" : "🎤"}
            </span>
            <span
              className={`absolute -bottom-14 rounded-full px-5 py-2 text-base font-bold ${
                isMicOn
                  ? "bg-rose-100 text-rose-700"
                  : "bg-sky-100 text-sky-700"
              }`}
            >
              {isMicOn ? "듣고 있어요" : "눌러서 시작"}
            </span>
          </button>
        </section>
      </main>
    </div>
  );
}
