"use client";

import type { RefObject } from "react";

type Props = {
  mouthRef: RefObject<HTMLDivElement | null>;
  className?: string;
};

/**
 * 귀여운 튜터 곰 (CSS만). `mouthRef`는 Web Audio 립싱크에서 `scaleY`로 움직입니다.
 */
export function TutorBear({ mouthRef, className = "" }: Props) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center ${className}`}
      aria-hidden
    >
      <div className="relative h-48 w-52 sm:h-56 sm:w-60">
        <div className="absolute -left-1 top-2 h-16 w-16 rounded-full bg-amber-900/90 shadow-md ring-2 ring-amber-950/20" />
        <div className="absolute -right-1 top-2 h-16 w-16 rounded-full bg-amber-900/90 shadow-md ring-2 ring-amber-950/20" />

        <div
          className="absolute bottom-0 left-1/2 h-44 w-44 -translate-x-1/2 rounded-[48%] bg-gradient-to-b from-amber-700 via-amber-800 to-amber-950 shadow-[inset_0_-18px_0_rgba(69,26,3,0.25),0_14px_32px_rgba(120,53,15,0.45)] sm:h-52 sm:w-52"
          style={{ transformOrigin: "50% 80%" }}
        >
          <div className="absolute left-[18%] top-[32%] h-3.5 w-3.5 rounded-full bg-stone-900 shadow-sm" />
          <div className="absolute right-[18%] top-[32%] h-3.5 w-3.5 rounded-full bg-stone-900 shadow-sm" />
          <div className="absolute left-1/2 top-[42%] h-2 w-8 -translate-x-1/2 rounded-full bg-amber-950/40" />

          <div className="absolute bottom-[20%] left-1/2 w-[58%] -translate-x-1/2 rounded-[45%] bg-amber-200/95 shadow-inner ring-1 ring-amber-900/10">
            <div className="relative flex flex-col items-center pb-3 pt-4">
              <div className="h-3 w-4 rounded-b-full bg-stone-800/90 shadow-sm" />
              <div
                ref={mouthRef}
                className="mt-1 h-2.5 w-10 rounded-full bg-rose-900/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                style={{
                  transformOrigin: "50% 50%",
                  transform: "scaleY(0.55)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-1 text-center text-xs font-semibold text-amber-950/70">
        튜터 곰
      </p>
    </div>
  );
}
