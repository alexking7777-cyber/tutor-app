"use server";

import type { AddChildState } from "@/app/parent/formState";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addChild(_prev: AddChildState, formData: FormData): Promise<AddChildState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    return { error: "Please enter the child’s name or nickname." };
  }

  const birthRaw = String(formData.get("birthYear") ?? "").trim();
  let birthYear: number | null = null;
  if (birthRaw) {
    const y = Number.parseInt(birthRaw, 10);
    const current = new Date().getFullYear();
    if (!Number.isFinite(y) || y < current - 18 || y > current) {
      return { error: "Birth year must be within the last 18 years." };
    }
    birthYear = y;
  }

  const cultureRaw = String(formData.get("primaryCultureId") ?? "").trim();
  let primaryCultureId: string | null = null;
  if (cultureRaw.length > 0) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(cultureRaw)) {
      return { error: "Invalid culture selection." };
    }
    primaryCultureId = cultureRaw;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You need to be logged in." };
  }

  const { data: parentRow, error: parentErr } = await supabase
    .from("parents")
    .select("household_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (parentErr || !parentRow?.household_id) {
    return { error: "Parent profile not found. Make sure sign-up completed." };
  }

  const { error } = await supabase.from("children").insert({
    household_id: parentRow.household_id,
    display_name: displayName,
    birth_year: birthYear,
    primary_culture_id: primaryCultureId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/parent");
  return { error: null };
}
