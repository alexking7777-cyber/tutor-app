"use client";

import { TutorBear } from "@/components/TutorBear";
import { TutorLiveSession } from "@/lib/gemini-live/tutorSession";
import { useCallback, useEffect, useRef, useState } from "react";

const INITIAL_TIME = 15 * 60;
const TIMER_TICK_MS = 250;
const LIP_DECAY = 0.28;

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function getApiKey() {
  return process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() ?? "";
}

function getModel() {
  return process.env.NEXT_PUBLIC_GEMINI_LIVE_MODEL?.trim() ?? "";
}

export default function Home() {
  const [isMicOn, setIsMicOn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(INITIAL_TIME);

  const sessionRef = useRef<TutorLiveSession | null>(null);
  const sessionEndsAtRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const timeUpFinalizingRef = useRef(false);

  const mouthRef = useRef<HTMLDivElement | null>(null);
  const bearBodyRef = useRef<HTMLDivElement | null>(null);
  const lipSmoothRef = useRef(1);

  const endLiveSession = useCallback(() => {
    sessionEndsAtRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  /** 표시용 남은 초는 `sessionEndsAt`과 시계만으로 계산해 1분대에서 끊기는 드리프트를 막습니다. */
  useEffect(() => {
    if (!isMicOn) {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    const id = window.setInterval(() => {
      const endAt = sessionEndsAtRef.current;
      if (endAt === null) {
        return;
      }
      const sec = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemainingSeconds(sec);

      if (sec > 0) {
        return;
      }

      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      if (timeUpFinalizingRef.current) {
        return;
      }
      timeUpFinalizingRef.current = true;

      void (async () => {
        try {
          const s = sessionRef.current;
          if (s) {
            await s.finalizeTimedOut();
            sessionRef.current = null;
          }
        } catch {
          endLiveSession();
        } finally {
          sessionEndsAtRef.current = null;
          setIsMicOn(false);
          timeUpFinalizingRef.current = false;
        }
      })();
    }, TIMER_TICK_MS);

    timerIntervalRef.current = id;
    return () => {
      window.clearInterval(id);
      timerIntervalRef.current = null;
    };
  }, [isMicOn, endLiveSession]);

  /** 모델 음성 출력 립싱크 (AnalyserNode). */
  useEffect(() => {
    const live = isMicOn && !isConnecting;
    if (!live) {
      lipSmoothRef.current = 1;
      if (mouthRef.current) {
        mouthRef.current.style.transform = "scaleY(0.55)";
      }
      if (bearBodyRef.current) {
        bearBodyRef.current.style.transform = "scale(1)";
      }
      return;
    }

    let raf = 0;
    const data = new Uint8Array(256);

    const tick = () => {
      const analyser = sessionRef.current?.getPlaybackAnalyser();
      if (!analyser || !mouthRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const target = 1 + Math.min(0.55, rms * 12);
      lipSmoothRef.current +=
        (target - lipSmoothRef.current) * (1 - LIP_DECAY);
      const s = lipSmoothRef.current;
      const mouthY = Math.min(
        1.28,
        Math.max(0.38, 0.48 + (s - 1) * 1.15 + rms * 6)
      );
      mouthRef.current.style.transform = `scaleY(${mouthY.toFixed(4)})`;
      if (bearBodyRef.current) {
        const bodyScale = 1 + Math.min(0.08, rms * 3.5);
        bearBodyRef.current.style.transform = `scale(${bodyScale.toFixed(4)})`;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isMicOn, isConnecting]);

  const handleMicToggle = async () => {
    if (isConnecting) {
      return;
    }
    if (remainingSeconds === 0) {
      setRemainingSeconds(INITIAL_TIME);
    }

    if (isMicOn) {
      sessionEndsAtRef.current = null;
      setIsMicOn(false);
      endLiveSession();
      setSessionError(null);
      return;
    }

    const key = getApiKey();
    if (!key) {
      setSessionError("NEXT_PUBLIC_GEMINI_API_KEY를 .env.local에 설정해 주세요.");
      return;
    }

    setSessionError(null);
    setIsConnecting(true);
    const model = getModel();
    const session = new TutorLiveSession({ apiKey: key, model: model || undefined });
    sessionRef.current = session;
    try {
      await session.start();
      if (session.status === "error") {
        setSessionError(session.lastError);
        setIsMicOn(false);
        endLiveSession();
        return;
      }
      sessionEndsAtRef.current = Date.now() + remainingSeconds * 1000;
      setIsMicOn(true);
    } catch (e) {
      setSessionError(
        e instanceof Error ? e.message : "연결에 실패했어요. 다시 눌러 주세요."
      );
      setIsMicOn(false);
      endLiveSession();
    } finally {
      setIsConnecting(false);
    }
  };

  const live = isMicOn && !isConnecting;
  const showWaves = live || isConnecting;

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 via-rose-100 to-sky-100 px-6 py-8">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col items-center rounded-[2.25rem] bg-white/75 p-6 shadow-xl backdrop-blur-sm sm:p-10">
        <header className="w-full rounded-3xl bg-white/80 p-5 shadow-sm">
          <p className="text-center text-sm font-semibold text-rose-500">
            오늘의 말하기 연습
          </p>
          <p className="mt-2 text-center text-5xl font-black tabular-nums tracking-wide text-rose-600">
            {formatTime(remainingSeconds)}
          </p>
          <p className="mt-2 text-center text-sm text-slate-500">
            약 15분 동안 튜터와 음성으로 대화해요. 00:00이 되면 마무리 인사 후 자연스럽게
            종료돼요.
          </p>
        </header>

        {sessionError && (
          <p
            className="mt-4 w-full rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2 text-center text-sm text-amber-900"
            role="alert"
          >
            {sessionError}
          </p>
        )}

        <div ref={bearBodyRef} className="mt-6 transition-transform duration-100">
          <TutorBear mouthRef={mouthRef} />
        </div>

        <section className="relative mt-4 flex flex-1 items-center justify-center pb-10">
          {showWaves && (
            <>
              <span
                className="pointer-events-none absolute inline-flex h-72 w-72 animate-soundring rounded-full bg-rose-300/20 sm:h-80 sm:w-80"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute inline-flex h-64 w-64 animate-soundring rounded-full bg-rose-400/20 [animation-delay:0.4s] sm:h-72 sm:w-72"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute inline-flex h-56 w-56 animate-soundring rounded-full bg-sky-300/15 [animation-delay:0.8s] sm:h-64 sm:w-64"
                aria-hidden
              />
            </>
          )}

          <button
            type="button"
            onClick={() => {
              void handleMicToggle();
            }}
            disabled={isConnecting}
            className={`relative flex h-52 w-52 items-center justify-center rounded-full border-8 transition-all duration-300 ease-out focus:outline-none focus:ring-4 focus:ring-rose-200 sm:h-64 sm:w-64 ${
              live
                ? "scale-105 border-rose-300 bg-rose-400 shadow-[0_0_0_14px_rgba(251,113,133,0.2)]"
                : isConnecting
                  ? "scale-100 border-amber-200 bg-amber-300/90 shadow-[0_0_0_14px_rgba(253,186,116,0.35)]"
                  : "border-sky-200 bg-sky-300 shadow-[0_0_0_14px_rgba(125,211,252,0.25)]"
            } ${isConnecting ? "cursor-wait" : ""}`}
            aria-pressed={live}
            aria-label={
              isConnecting
                ? "연결 중"
                : live
                  ? "마이크 끄기"
                  : "마이크 켜기"
            }
            aria-busy={isConnecting}
          >
            <span className="text-7xl sm:text-8xl" aria-hidden="true">
              {isConnecting ? "⏳" : live ? "🎙️" : "🎤"}
            </span>
            <span
              className={`absolute -bottom-12 rounded-full px-4 py-2 text-sm font-bold sm:text-base ${
                live
                  ? "bg-rose-100 text-rose-700"
                  : isConnecting
                    ? "bg-amber-100 text-amber-800"
                    : "bg-sky-100 text-sky-700"
              }`}
            >
              {isConnecting
                ? "연결 중…"
                : live
                  ? "듣고 있어요"
                  : "눌러서 시작"}
            </span>
          </button>
        </section>
      </main>
    </div>
  );
}
