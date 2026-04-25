"use client";

import { setChildReviewMode } from "@/app/parent/learningActions";
import {
  learningFormInitialState,
  type LearningFormState,
} from "@/app/parent/learningFormState";
import { useActionState, useRef } from "react";

type Props = {
  childId: string;
  /** Server truth after last save; used to reset local select when props change. */
  reviewModeEnabled: boolean;
};

export function ReviewModeSelect({ childId, reviewModeEnabled }: Props) {
  const [state, formAction, pending] = useActionState<LearningFormState, FormData>(
    setChildReviewMode,
    learningFormInitialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-col gap-1">
      <input type="hidden" name="childId" value={childId} />
      <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
        Review mode
        <select
          name="enabled"
          disabled={pending}
          defaultValue={reviewModeEnabled ? "true" : "false"}
          key={`${childId}-${reviewModeEnabled ? "1" : "0"}`}
          onChange={() => {
            formRef.current?.requestSubmit();
          }}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
        >
          <option value="false">Off</option>
          <option value="true">On</option>
        </select>
      </label>
      {state.error && (
        <p className="text-xs text-rose-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
