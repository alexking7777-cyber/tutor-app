"use client";

import { signUp } from "@/app/auth/actions";
import { authFormInitialState, type AuthFormState } from "@/app/auth/formState";
import { useActionState } from "react";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUp,
    authFormInitialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Display name
        <input
          name="displayName"
          type="text"
          autoComplete="name"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-rose-300"
          placeholder="e.g. Alex’s mom"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-rose-300"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Password (8+ characters)
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-rose-300"
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
        className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Creating account…" : "Sign up"}
      </button>
    </form>
  );
}
