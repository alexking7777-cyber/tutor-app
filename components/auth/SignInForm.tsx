"use client";

import { signIn } from "@/app/auth/actions";
import { authFormInitialState, type AuthFormState } from "@/app/auth/formState";
import { useActionState } from "react";

type Props = {
  /** After sign-in, redirect here if safe (internal path only). */
  nextPath?: string | null;
};

export function SignInForm({ nextPath = null }: Props) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    authFormInitialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-sky-300"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-sky-300"
        />
      </label>
      {state.error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Log in"}
      </button>
    </form>
  );
}
