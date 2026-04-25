import { safeRedirectPathOrNull } from "@/lib/auth/safeRedirectPath";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TutorHomeClient, type TutorHomeChild } from "./tutor-home-client";

function buildNextPath(sp: Record<string, string | string[] | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) {
      continue;
    }
    if (typeof v === "string" && v.length > 0) {
      p.set(k, v);
    } else if (Array.isArray(v) && v[0] != null && String(v[0]).length > 0) {
      p.set(k, String(v[0]));
    }
  }
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nextPath = buildNextPath(sp);
  const nextForSignIn = safeRedirectPathOrNull(nextPath) ?? "/";

  if (!user) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(nextForSignIn)}`);
  }

  const { data: parent } = await supabase
    .from("parents")
    .select("household_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!parent?.household_id) {
    redirect("/parent");
  }

  const { data: childrenRows } = await supabase
    .from("children")
    .select("id, display_name")
    .eq("household_id", parent.household_id)
    .order("created_at", { ascending: true });

  const tutorChildren: TutorHomeChild[] = (childrenRows ?? []).map((c) => ({
    id: c.id,
    displayName: c.display_name,
  }));

  return <TutorHomeClient tutorChildren={tutorChildren} />;
}
