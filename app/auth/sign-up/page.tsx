import { SignUpForm } from "@/components/auth/SignUpForm";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 via-rose-100 to-sky-100 px-6 py-10">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center rounded-[2rem] bg-white/80 p-8 shadow-xl backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-slate-900">Create parent account</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          After sign-up you can add child profiles from Parent home.
        </p>
        <div className="mt-8 w-full flex justify-center">
          <SignUpForm />
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="font-semibold text-rose-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
