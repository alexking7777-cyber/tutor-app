import { SignInForm } from "@/components/auth/SignInForm";
import { safeRedirectPathOrNull } from "@/lib/auth/safeRedirectPath";
import Link from "next/link";

type Props = {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const q = await searchParams;
  const urlError = q.error;
  const notice = q.notice;
  const nextPath = safeRedirectPathOrNull(q.next);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 via-rose-100 to-sky-100 px-6 py-10">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center rounded-[2rem] bg-white/80 p-8 shadow-xl backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-slate-900">Parent log in</h1>
        <p className="mt-2 text-center text-sm text-slate-600">Use the email and password you registered with.</p>
        {notice === "check_email" && (
          <p className="mt-4 w-full max-w-sm rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-center text-sm text-sky-900" role="status">
            We sent a confirmation email. Open the link, then log in here.
          </p>
        )}
        {urlError && (
          <p className="mt-4 w-full max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-900" role="alert">
            {decodeURIComponent(urlError)}
          </p>
        )}
        <div className="mt-8 w-full flex justify-center">
          <SignInForm nextPath={nextPath} />
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          No account yet?{" "}
          <Link href="/auth/sign-up" className="font-semibold text-sky-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
