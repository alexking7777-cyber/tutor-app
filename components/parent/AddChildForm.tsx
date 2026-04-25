"use client";

import { addChild } from "@/app/parent/actions";
import { addChildInitialState, type AddChildState } from "@/app/parent/formState";
import { useActionState, useEffect, useRef, type RefObject } from "react";

function useResetFormOnSuccess(
  pending: boolean,
  state: AddChildState,
  formRef: RefObject<HTMLFormElement | null>,
) {
  const wasPendingRef = useRef(false);
  useEffect(() => {
    if (wasPendingRef.current && !pending && state.error === null) {
      formRef.current?.reset();
    }
    wasPendingRef.current = pending;
  }, [pending, state.error, formRef]);
}

export type CultureOption = { id: string; name: string; slug: string };

type Props = { cultures: CultureOption[] };

export function AddChildForm({ cultures }: Props) {
  const [state, formAction, pending] = useActionState<AddChildState, FormData>(
    addChild,
    addChildInitialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useResetFormOnSuccess(pending, state, formRef);

  return (
    <section className="mt-8 rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Add a child</h2>
      <p className="mt-1 text-sm text-slate-600">Register a learner in this household.</p>

      <form ref={formRef} action={formAction} className="mt-4 flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Name / nickname
          <input
            name="displayName"
            type="text"
            required
            maxLength={80}
            placeholder="e.g. Minji"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-rose-300"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Birth year (optional)
          <input
            name="birthYear"
            type="number"
            min={new Date().getFullYear() - 18}
            max={new Date().getFullYear()}
            placeholder="e.g. 2016"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-rose-300"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Default heritage culture (optional)
          <select
            name="primaryCultureId"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-rose-300"
            defaultValue=""
          >
            <option value="">None</option>
            {cultures.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {state.error && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Saving…" : "Add child"}
        </button>
      </form>
    </section>
  );
}
