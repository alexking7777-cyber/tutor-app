"use client";

import type { RefObject } from "react";

type Props = {
  mouthRef: RefObject<HTMLDivElement | null>;
  className?: string;
};

/**
 * 노란 캡슐형 튜터 "로빈" (미니언 느낌의 오리지널 캐릭터, CSS만).
 * 고글 + 작은 몸통, `mouthRef`로 립싱크 scaleY.
 */
export function TutorMinionRobin({ mouthRef, className = "" }: Props) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center ${className}`}
      aria-hidden
    >
      <div className="relative pt-3">
        <div className="absolute left-1/2 top-0 z-10 flex h-9 w-[7.5rem] -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-b from-slate-300 to-slate-400 shadow-md ring-1 ring-slate-600/25">
          <div className="flex gap-3 px-2">
            <div className="relative h-6 w-6 rounded-full bg-white shadow-inner ring-1 ring-slate-500/30">
              <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-800" />
            </div>
            <div className="relative h-6 w-6 rounded-full bg-white shadow-inner ring-1 ring-slate-500/30">
              <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-800" />
            </div>
          </div>
        </div>

        <div className="relative mt-5 flex h-[8.5rem] w-[6.25rem] flex-col items-center rounded-[42%] bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-500 shadow-[inset_0_-14px_0_rgba(202,138,4,0.35),0_12px_28px_rgba(234,179,8,0.4)] ring-2 ring-yellow-600/15 sm:h-40 sm:w-28">
          <div className="mt-[46%] flex w-[72%] flex-col items-center">
            <div
              ref={mouthRef}
              className="h-2.5 w-11 rounded-full bg-amber-950/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
              style={{
                transformOrigin: "50% 50%",
                transform: "scaleY(0.5)",
                willChange: "transform",
              }}
            />
          </div>

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[38%] rounded-b-[42%] bg-gradient-to-b from-sky-600/95 to-sky-800 shadow-inner" />
          <div className="pointer-events-none absolute -top-0.5 left-[18%] h-7 w-3 rounded-b-md bg-sky-700/95 shadow-sm" />
          <div className="pointer-events-none absolute -top-0.5 right-[18%] h-7 w-3 rounded-b-md bg-sky-700/95 shadow-sm" />
        </div>
      </div>
      <p className="mt-2 text-center text-xs font-semibold text-yellow-900/75">
        튜터 로빈
      </p>
    </div>
  );
}
