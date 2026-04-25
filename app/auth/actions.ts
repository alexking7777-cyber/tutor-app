"use server";

import type { AuthFormState } from "@/app/auth/formState";
import { safeRedirectPath } from "@/lib/auth/safeRedirectPath";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function ensureParentProfile(params: {
  userId: string;
  email: string;
  displayName: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("parents")
    .select("id")
    .eq("auth_user_id", params.userId)
    .maybeSingle();
  if (existing) {
    return;
  }

  const { data: household, error: hhErr } = await admin
    .from("households")
    .insert({ display_name: params.displayName || params.email })
    .select("id")
    .single();

  if (hhErr || !household) {
    throw new Error(hhErr?.message ?? "household insert failed");
  }

  const { error: pErr } = await admin.from("parents").insert({
    household_id: household.id,
    email: params.email,
    display_name: params.displayName || null,
    auth_user_id: params.userId,
  });

  if (pErr) {
    throw new Error(pErr.message);
  }
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) {
    return { error: "Please enter email and password." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      data: { display_name: displayName },
    },
  });

  if (error) {
    return { error: error.message };
  }

  const user = data.user;
  if (!user?.id) {
    return { error: "Sign-up did not return user info. Please try again." };
  }

  try {
    await ensureParentProfile({
      userId: user.id,
      email,
      displayName,
    });
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Could not create household profile. Check that SUPABASE_SERVICE_ROLE_KEY is set on the server.",
    };
  }

  if (!data.session) {
    redirect("/auth/sign-in?notice=check_email");
  }
  redirect("/parent");
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message };
  }

  const nextRaw = formData.get("next");
  redirect(safeRedirectPath(nextRaw, "/parent"));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}
