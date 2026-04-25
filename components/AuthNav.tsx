import { signOut } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export async function AuthNav() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <nav className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <Link href="/" className="font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline">
        Tutor
      </Link>
      {user ? (
        <>
          <Link
            href="/parent"
            className="font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            Parent home
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Log out
            </button>
          </form>
        </>
      ) : (
        <>
          <Link
            href="/auth/sign-in"
            className="font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            Log in
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-full bg-rose-500 px-3 py-1.5 font-semibold text-white hover:bg-rose-600"
          >
            Sign up
          </Link>
        </>
      )}
    </nav>
  );
}
