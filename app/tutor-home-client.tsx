"use client";

import { signOut } from "@/app/auth/actions";
import { ParentReportPanel } from "@/components/ParentReportPanel";
import type { BilingualParentReport } from "@/lib/parentReportGemini";
import { TutorMinionRobin } from "@/components/TutorMinionRobin";
import { generateBilingualParentReport } from "@/lib/parentReportGemini";
import {
  TutorLiveSession,
  type TranscriptLine,
} from "@/lib/gemini-live/tutorSession";
import { resolveTutorUiLocale, type TutorUiLocale } from "@/lib/i18n/tutorLocale";
import { getTutorUiStrings } from "@/lib/i18n/tutorUiStrings";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

const INITIAL_TIME = 15 * 60;
const TIMER_TICK_MS = 250;
const LIP_DECAY = 0.58;

export type TutorHomeChild = {
  id: string;
  displayName: string;
};

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

const CHILD_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchTutorCurriculumContext(
  childId: string,
  locale: TutorUiLocale,
): Promise<
  | { kind: "unauthorized" }
  | { kind: "error" }
  | { kind: "ok"; contextBlock: string; topicLabel: string | null; kickoffUserText: string }
> {
  const r = await fetch(
    `/api/tutor-session-context?childId=${encodeURIComponent(childId)}&locale=${locale}`,
    { credentials: "same-origin" },
  );
  if (r.status === 401) {
    return { kind: "unauthorized" };
  }
  if (!r.ok) {
    return { kind: "error" };
  }
  const j = (await r.json()) as {
    contextBlock: string | null;
    topicLabel: string | null;
    kickoffUserText: string | null;
  };
  const block = typeof j.contextBlock === "string" ? j.contextBlock.trim() : "";
  const topic = typeof j.topicLabel === "string" ? j.topicLabel.trim() : null;
  const kick =
    typeof j.kickoffUserText === "string" && j.kickoffUserText.trim().length > 0
      ? j.kickoffUserText.trim()
      : "";
  return { kind: "ok", contextBlock: block, topicLabel: topic || null, kickoffUserText: kick };
}

type CurriculumPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "need_login" }
  | { status: "error" }
  | { status: "ready"; topic: string | null };

function TutorHomeInner({ tutorChildren }: { tutorChildren: TutorHomeChild[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tutorLocale = useMemo(
    () =>
      resolveTutorUiLocale({
        localeParam: searchParams.get("locale"),
        cultureParam: searchParams.get("culture"),
      }),
    [searchParams],
  );
  const ui = useMemo(() => getTutorUiStrings(tutorLocale), [tutorLocale]);

  const childIdParam = useMemo(
    () => searchParams.get("child")?.trim() ?? "",
    [searchParams],
  );
  const uuidLooksValid = childIdParam.length > 0 && CHILD_UUID_RE.test(childIdParam);
  const selectedChildId = useMemo(() => {
    if (!uuidLooksValid) {
      return null;
    }
    return tutorChildren.some((c) => c.id === childIdParam) ? childIdParam : null;
  }, [childIdParam, uuidLooksValid, tutorChildren]);

  const unknownChildUuid =
    uuidLooksValid && tutorChildren.length > 0 && selectedChildId === null;
  const invalidChildParam = childIdParam.length > 0 && !uuidLooksValid;

  useEffect(() => {
    if (tutorChildren.length !== 1) {
      return;
    }
    const onlyId = tutorChildren[0]!.id;
    if (selectedChildId === onlyId) {
      return;
    }
    const qp = new URLSearchParams(searchParams.toString());
    qp.set("child", onlyId);
    router.replace(`/?${qp.toString()}`);
  }, [tutorChildren, selectedChildId, router, searchParams]);

  const setChildQuery = useCallback(
    (id: string) => {
      const qp = new URLSearchParams(searchParams.toString());
      qp.set("child", id);
      router.replace(`/?${qp.toString()}`);
    },
    [router, searchParams],
  );

  const [curriculumPreview, setCurriculumPreview] =
    useState<CurriculumPreviewState>({ status: "idle" });

  const [isMicOn, setIsMicOn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(INITIAL_TIME);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBilingual, setReportBilingual] = useState<BilingualParentReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportGeneration, setReportGeneration] = useState(0);
  const reportInFlightRef = useRef(false);

  useEffect(() => {
    if (!selectedChildId) {
      setCurriculumPreview({ status: "idle" });
      return;
    }
    let cancelled = false;
    setCurriculumPreview({ status: "loading" });
    void (async () => {
      const ctx = await fetchTutorCurriculumContext(selectedChildId, tutorLocale);
      if (cancelled) {
        return;
      }
      if (ctx.kind === "unauthorized") {
        setCurriculumPreview({ status: "need_login" });
        return;
      }
      if (ctx.kind === "error") {
        setCurriculumPreview({ status: "error" });
        return;
      }
      setCurriculumPreview({ status: "ready", topic: ctx.topicLabel });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedChildId, tutorLocale]);

  const sessionRef = useRef<TutorLiveSession | null>(null);
  const sessionEndsAtRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const timeUpFinalizingRef = useRef(false);

  const mouthRef = useRef<HTMLDivElement | null>(null);
  const mascotBodyRef = useRef<HTMLDivElement | null>(null);
  const lipSmoothRef = useRef(1);

  const endLiveSession = useCallback(() => {
    sessionEndsAtRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const onTranscriptChange = useCallback((lines: TranscriptLine[]) => {
    setTranscript(lines);
  }, []);

  const requestParentReport = useCallback(
    async (lines: TranscriptLine[]) => {
      if (reportInFlightRef.current) {
        return;
      }
      reportInFlightRef.current = true;
      setReportOpen(false);
      setReportBilingual(null);
      setReportError(null);

      try {
        const key = getApiKey();
        if (!key) {
          setReportError(ui.reportNoApiKey);
          setReportOpen(true);
          return;
        }

        if (lines.length === 0) {
          setReportGeneration((g) => g + 1);
          setReportBilingual({
            en: ui.reportNoTranscriptEn,
            heritage: ui.reportNoTranscriptHeritage,
            errorEn: null,
            errorHeritage: null,
          });
          setReportOpen(true);
          return;
        }

        const result = await generateBilingualParentReport(key, lines, tutorLocale);
        setReportGeneration((g) => g + 1);
        setReportBilingual(result);
        setReportOpen(true);
      } catch (e) {
        setReportError(e instanceof Error ? e.message : ui.reportFailed);
        setReportBilingual(null);
        setReportOpen(true);
      } finally {
        reportInFlightRef.current = false;
      }
    },
    [ui, tutorLocale],
  );

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
            const snap = await s.finalizeTimedOut();
            sessionRef.current = null;
            setTranscript([]);
            await requestParentReport(snap);
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
  }, [isMicOn, endLiveSession, requestParentReport]);

  useEffect(() => {
    const live = isMicOn && !isConnecting;
    if (!live) {
      lipSmoothRef.current = 1;
      if (mouthRef.current) {
        mouthRef.current.style.transform = "scaleY(0.5)";
      }
      if (mascotBodyRef.current) {
        mascotBodyRef.current.style.transform = "scale(1)";
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
      const target = 1 + Math.min(0.42, rms * 9);
      lipSmoothRef.current +=
        (target - lipSmoothRef.current) * (1 - LIP_DECAY);
      const s = lipSmoothRef.current;
      const mouthY = Math.min(
        1.18,
        Math.max(0.42, 0.5 + (s - 1) * 0.85 + rms * 4.5),
      );
      mouthRef.current.style.transform = `scaleY(${mouthY.toFixed(4)})`;
      if (mascotBodyRef.current) {
        const bodyScale = 1 + Math.min(0.035, rms * 2.2);
        mascotBodyRef.current.style.transform = `scale(${bodyScale.toFixed(4)})`;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isMicOn, isConnecting]);

  const micStartBlocked =
    tutorChildren.length === 0 || selectedChildId === null;

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
      const s = sessionRef.current;
      const snap = s?.getTranscriptSnapshot() ?? [];
      s?.stop();
      sessionRef.current = null;
      setTranscript([]);
      setSessionError(null);
      void requestParentReport(snap);
      return;
    }

    if (micStartBlocked || !selectedChildId) {
      setSessionError(ui.tutorMicBlockedHint);
      return;
    }

    const key = getApiKey();
    if (!key) {
      setSessionError(ui.sessionNoApiKey);
      return;
    }

    setSessionError(null);
    setIsConnecting(true);
    const model = getModel();

    let curriculumContextBlock: string | undefined;
    let sessionKickoffRealtimeText: string | undefined;
    const ctx = await fetchTutorCurriculumContext(selectedChildId, tutorLocale);
    if (ctx.kind === "ok") {
      setCurriculumPreview({ status: "ready", topic: ctx.topicLabel });
      if (ctx.contextBlock.length > 0) {
        curriculumContextBlock = ctx.contextBlock;
        if (ctx.kickoffUserText.length > 0) {
          sessionKickoffRealtimeText = ctx.kickoffUserText;
        }
      }
    }

    const session = new TutorLiveSession({
      apiKey: key,
      model: model || undefined,
      tutorUiLocale: tutorLocale,
      curriculumContextBlock,
      sessionKickoffRealtimeText,
      onTranscriptChange,
    });
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
        e instanceof Error ? e.message : ui.sessionConnectFailed,
      );
      setIsMicOn(false);
      endLiveSession();
    } finally {
      setIsConnecting(false);
    }
  };

  const live = isMicOn && !isConnecting;
  const showWaves = live || isConnecting;
  const showChildPicker = tutorChildren.length > 1 && selectedChildId === null;
  const micDisabled = isConnecting || (!live && micStartBlocked);

  return (
    <div
      lang={ui.htmlLang}
      className="min-h-screen bg-gradient-to-b from-amber-100 via-rose-100 to-sky-100 px-6 py-8"
      data-transcript-lines={transcript.length}
    >
      <ParentReportPanel
        key={reportGeneration}
        open={reportOpen}
        globalError={reportError}
        report={reportBilingual}
        labels={ui.reportPanel}
        onClose={() => {
          setReportOpen(false);
          setReportBilingual(null);
          setReportError(null);
        }}
      />

      <nav className="mx-auto mb-4 flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          href="/parent"
          className="font-semibold text-slate-700 underline-offset-2 hover:underline"
        >
          {ui.tutorNavParent}
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
          >
            {ui.tutorNavSignOut}
          </button>
        </form>
      </nav>

      <p className="mx-auto mb-4 max-w-3xl text-center text-xs text-slate-600">{ui.tutorAccountNote}</p>

      {tutorChildren.length === 0 && (
        <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-center text-sm text-amber-950">
          {ui.tutorNoChildren}{" "}
          <Link href="/parent" className="font-semibold text-rose-600 underline-offset-2 hover:underline">
            {ui.tutorGoParentAddChild}
          </Link>
        </div>
      )}

      {invalidChildParam && (
        <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-center text-sm text-rose-900">
          {ui.tutorInvalidChildParam}
        </div>
      )}

      {unknownChildUuid && (
        <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-center text-sm text-rose-900">
          {ui.tutorWrongChildInUrl}
        </div>
      )}

      {showChildPicker && (
        <section className="mx-auto mb-6 w-full max-w-3xl rounded-2xl border border-sky-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-center text-base font-bold text-slate-900">{ui.tutorPickChildTitle}</h2>
          <p className="mt-2 text-center text-xs text-slate-600">{ui.tutorPickChildHint}</p>
          <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {tutorChildren.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setChildQuery(c.id)}
                  className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm font-semibold text-sky-900 hover:bg-sky-100 sm:min-w-[12rem] sm:text-center"
                >
                  {c.displayName}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col items-center rounded-[2.25rem] bg-white/75 p-6 shadow-xl backdrop-blur-sm sm:p-10">
        <header className="w-full rounded-3xl bg-white/80 p-5 shadow-sm">
          <p className="text-center text-sm font-semibold text-rose-500">
            {ui.headerEyebrow}
          </p>
          <p className="mt-2 text-center text-5xl font-black tabular-nums tracking-wide text-rose-600">
            {formatTime(remainingSeconds)}
          </p>
          <p className="mt-2 text-center text-sm text-slate-500">{ui.timerHint}</p>
          {selectedChildId && curriculumPreview.status === "loading" && (
            <p className="mt-3 text-center text-xs text-slate-500">{ui.curriculumLoading}</p>
          )}
          {selectedChildId && curriculumPreview.status === "need_login" && (
            <p
              className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-center text-xs text-amber-900"
              role="status"
            >
              {ui.curriculumNeedLogin}
            </p>
          )}
          {selectedChildId && curriculumPreview.status === "error" && (
            <p className="mt-3 text-center text-xs text-rose-600" role="alert">
              {ui.sessionConnectFailed}
            </p>
          )}
          {selectedChildId && curriculumPreview.status === "ready" && (
            <div className="mt-3 rounded-xl border border-sky-200/80 bg-sky-50/80 px-3 py-2 text-center text-xs text-slate-700">
              <p className="font-semibold text-sky-800">{ui.curriculumSessionTopic}</p>
              {curriculumPreview.topic ? (
                <p className="mt-1 text-sm text-slate-800">{curriculumPreview.topic}</p>
              ) : (
                <p className="mt-1 text-slate-600">{ui.curriculumNoActive}</p>
              )}
            </div>
          )}
        </header>

        {sessionError && (
          <p
            className="mt-4 w-full rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2 text-center text-sm text-amber-900"
            role="alert"
          >
            {sessionError}
          </p>
        )}

        <div ref={mascotBodyRef} className="mt-6">
          <TutorMinionRobin mouthRef={mouthRef} caption={ui.tutorMascotCaption} />
        </div>

        <section className="relative mt-4 flex flex-1 flex-col items-center justify-center pb-10">
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
            disabled={micDisabled}
            className={`relative flex h-52 w-52 items-center justify-center rounded-full border-8 transition-all duration-300 ease-out focus:outline-none focus:ring-4 focus:ring-rose-200 sm:h-64 sm:w-64 ${
              live
                ? "scale-105 border-rose-300 bg-rose-400 shadow-[0_0_0_14px_rgba(251,113,133,0.2)]"
                : isConnecting
                  ? "scale-100 border-amber-200 bg-amber-300/90 shadow-[0_0_0_14px_rgba(253,186,116,0.35)]"
                  : micStartBlocked
                    ? "cursor-not-allowed border-slate-200 bg-slate-200 opacity-70"
                    : "border-sky-200 bg-sky-300 shadow-[0_0_0_14px_rgba(125,211,252,0.25)]"
            } ${isConnecting ? "cursor-wait" : ""}`}
            aria-pressed={live}
            aria-label={
              isConnecting
                ? ui.micAriaConnecting
                : live
                  ? ui.micAriaLive
                  : ui.micAriaOff
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
                    : micStartBlocked
                      ? "bg-slate-100 text-slate-600"
                      : "bg-sky-100 text-sky-700"
              }`}
            >
              {isConnecting
                ? ui.micLabelConnecting
                : live
                  ? ui.micLabelLive
                  : micStartBlocked
                    ? ui.micLabelBlocked
                    : ui.micLabelStart}
            </span>
          </button>
          {micStartBlocked && !live && (
            <p className="mt-16 max-w-sm text-center text-xs text-slate-600">{ui.tutorMicBlockedHint}</p>
          )}
        </section>
      </main>
    </div>
  );
}

export function TutorHomeClient({ tutorChildren }: { tutorChildren: TutorHomeChild[] }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
          Loading…
        </div>
      }
    >
      <TutorHomeInner tutorChildren={tutorChildren} />
    </Suspense>
  );
}
