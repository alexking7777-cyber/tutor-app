"use client";

import {
  enrollChildInCurriculum,
} from "@/app/parent/learningActions";
import {
  learningFormInitialState,
  type LearningFormState,
} from "@/app/parent/learningFormState";
import { useActionState } from "react";

export type CurriculumPick = {
  id: string;
  title: string;
  slug: string;
  cultureName: string | null;
};

type Props = {
  childId: string;
  childName: string;
  curricula: CurriculumPick[];
  activeCurriculumId: string | null;
};

export function EnrollCurriculumForm({
  childId,
  childName,
  curricula,
  activeCurriculumId,
}: Props) {
  const [state, formAction, pending] = useActionState<LearningFormState, FormData>(
    enrollChildInCurriculum,
    learningFormInitialState,
  );

  if (curricula.length === 0) {
    return (
      <p className="mt-2 text-xs text-amber-800">
        No curricula in the database yet. Add rows to <code className="rounded bg-amber-100 px-1">cultures</code>,{" "}
        <code className="rounded bg-amber-100 px-1">curricula</code>, and{" "}
        <code className="rounded bg-amber-100 px-1">lessons</code> in Supabase (or run a seed SQL).
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <input type="hidden" name="childId" value={childId} />
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
        Curriculum for {childName}
        <select
          name="curriculumId"
          defaultValue={activeCurriculumId ?? ""}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
        >
          <option value="">Select…</option>
          {curricula.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
              {c.cultureName ? ` · ${c.cultureName}` : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error && (
        <p className="w-full text-xs text-rose-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
