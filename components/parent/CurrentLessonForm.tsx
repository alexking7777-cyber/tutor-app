"use client";

import { setChildCurriculumCurrentLesson } from "@/app/parent/learningActions";
import {
  learningFormInitialState,
  type LearningFormState,
} from "@/app/parent/learningFormState";
import { useActionState, useRef } from "react";

export type LessonOption = { id: string; title: string; sequenceOrder: number };

type Props = {
  childId: string;
  curriculumId: string;
  lessons: LessonOption[];
  currentLessonId: string | null;
};

export function CurrentLessonForm({
  childId,
  curriculumId,
  lessons,
  currentLessonId,
}: Props) {
  const [state, formAction, pending] = useActionState<LearningFormState, FormData>(
    setChildCurriculumCurrentLesson,
    learningFormInitialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const selectKey = `${childId}-${curriculumId}-${currentLessonId ?? ""}`;

  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-col gap-1">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="curriculumId" value={curriculumId} />
      <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
        Current lesson
        <select
          name="currentLessonId"
          disabled={pending || lessons.length === 0}
          defaultValue={currentLessonId ?? ""}
          key={selectKey}
          onChange={() => {
            formRef.current?.requestSubmit();
          }}
          className="min-w-[10rem] max-w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
        >
          <option value="">Not set</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.sequenceOrder}. {l.title}
            </option>
          ))}
        </select>
      </label>
      {lessons.length === 0 && (
        <p className="text-xs text-slate-500">No lessons in catalog for this curriculum.</p>
      )}
      {state.error && (
        <p className="text-xs text-rose-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
