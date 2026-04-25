"use client";

import {
  saveParentChildFlags,
} from "@/app/parent/learningActions";
import {
  learningFormInitialState,
  type LearningFormState,
} from "@/app/parent/learningFormState";
import { useActionState, useEffect, useState } from "react";

type Props = {
  childId: string;
  /** Pretty-printed JSON from server; resets textarea when it changes after revalidate. */
  flagsJsonDefault: string;
};

export function ParentChildFlagsForm({ childId, flagsJsonDefault }: Props) {
  const [state, formAction, pending] = useActionState<LearningFormState, FormData>(
    saveParentChildFlags,
    learningFormInitialState,
  );
  const [text, setText] = useState(flagsJsonDefault);

  useEffect(() => {
    setText(flagsJsonDefault);
  }, [flagsJsonDefault]);

  const isEmptyObject =
    text.replace(/\s/g, "") === "{}" || text.replace(/\s/g, "") === "";

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-1">
      <input type="hidden" name="childId" value={childId} />
      <div>
        <label className="text-xs font-medium text-slate-600">
          Optional feature flags (JSON object)
        </label>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          <code className="rounded bg-slate-100/80 px-1">{"{}"}</code> is the normal default: no extra toggles
          stored yet. Curriculum and <strong className="font-medium text-slate-700">today’s lesson</strong> are
          set with <strong className="font-medium text-slate-700">Current lesson</strong> above, not here. Only
          edit this field if your product adds custom JSON flags.
        </p>
        <textarea
          name="flagsJson"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          rows={6}
          spellCheck={false}
          placeholder='{ "example": true }'
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900"
        />
        {isEmptyObject && (
          <p className="mt-1 text-[11px] text-slate-400">Empty object — nothing wrong.</p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save flags"}
      </button>
      {state.error && (
        <p className="text-xs text-rose-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
