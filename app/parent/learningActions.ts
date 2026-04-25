"use server";

import type { LearningFormState } from "@/app/parent/learningFormState";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getParentForUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, user: null, parent: null as { id: string } | null };
  }
  const { data: parent } = await supabase
    .from("parents")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return { supabase, user, parent: parent as { id: string } | null };
}

async function assertChildAccess(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  childId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: childRow, error: childErr } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .maybeSingle();
  if (childErr) {
    return { ok: false, message: childErr.message };
  }
  if (!childRow) {
    return { ok: false, message: "Child not found or no access." };
  }
  return { ok: true };
}

export async function enrollChildInCurriculum(
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  const childId = String(formData.get("childId") ?? "").trim();
  const curriculumId = String(formData.get("curriculumId") ?? "").trim();
  if (!childId || !UUID_RE.test(childId)) {
    return { error: "Invalid child." };
  }
  if (!curriculumId || !UUID_RE.test(curriculumId)) {
    return { error: "Please choose a curriculum." };
  }

  const { supabase, user, parent } = await getParentForUser();
  if (!user || !parent) {
    return { error: "You need to be logged in." };
  }

  const gate = await assertChildAccess(supabase, childId);
  if (!gate.ok) {
    return { error: gate.message };
  }

  const { error: deactivateErr } = await supabase
    .from("child_curriculum_enrollments")
    .update({ is_active: false })
    .eq("child_id", childId);
  if (deactivateErr) {
    return { error: deactivateErr.message };
  }

  const { error: upsertErr } = await supabase.from("child_curriculum_enrollments").upsert(
    {
      child_id: childId,
      curriculum_id: curriculumId,
      is_active: true,
    },
    { onConflict: "child_id,curriculum_id" },
  );
  if (upsertErr) {
    return { error: upsertErr.message };
  }

  revalidatePath("/parent");
  return { error: null };
}

export async function setChildReviewMode(
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  const childId = String(formData.get("childId") ?? "").trim();
  const enabledRaw = String(formData.get("enabled") ?? "").trim();
  const enabled = enabledRaw === "true" || enabledRaw === "1" || enabledRaw === "on";

  if (!childId || !UUID_RE.test(childId)) {
    return { error: "Invalid child." };
  }

  const { supabase, user, parent } = await getParentForUser();
  if (!user || !parent) {
    return { error: "You need to be logged in." };
  }

  const gate = await assertChildAccess(supabase, childId);
  if (!gate.ok) {
    return { error: gate.message };
  }

  const { data: existing } = await supabase
    .from("parent_child_settings")
    .select("flags")
    .eq("parent_id", parent.id)
    .eq("child_id", childId)
    .maybeSingle();

  const flags =
    existing?.flags && typeof existing.flags === "object" && !Array.isArray(existing.flags)
      ? (existing.flags as Record<string, unknown>)
      : {};

  const { error } = await supabase.from("parent_child_settings").upsert(
    {
      parent_id: parent.id,
      child_id: childId,
      review_mode_enabled: enabled,
      flags,
    },
    { onConflict: "parent_id,child_id" },
  );
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/parent");
  return { error: null };
}

export async function saveParentChildFlags(
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  const childId = String(formData.get("childId") ?? "").trim();
  const raw = String(formData.get("flagsJson") ?? "").trim();

  if (!childId || !UUID_RE.test(childId)) {
    return { error: "Invalid child." };
  }
  if (!raw) {
    return { error: "Flags JSON cannot be empty. Use {} for an empty object." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { error: "Invalid JSON. Fix syntax and try again." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Flags must be a JSON object (not an array or primitive)." };
  }

  const { supabase, user, parent } = await getParentForUser();
  if (!user || !parent) {
    return { error: "You need to be logged in." };
  }

  const gate = await assertChildAccess(supabase, childId);
  if (!gate.ok) {
    return { error: gate.message };
  }

  const { data: existing } = await supabase
    .from("parent_child_settings")
    .select("review_mode_enabled")
    .eq("parent_id", parent.id)
    .eq("child_id", childId)
    .maybeSingle();

  const { error } = await supabase.from("parent_child_settings").upsert(
    {
      parent_id: parent.id,
      child_id: childId,
      review_mode_enabled: existing?.review_mode_enabled ?? false,
      flags: parsed as Record<string, unknown>,
    },
    { onConflict: "parent_id,child_id" },
  );
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/parent");
  return { error: null };
}

export async function setChildCurriculumCurrentLesson(
  _prev: LearningFormState,
  formData: FormData,
): Promise<LearningFormState> {
  const childId = String(formData.get("childId") ?? "").trim();
  const curriculumId = String(formData.get("curriculumId") ?? "").trim();
  const lessonRaw = String(formData.get("currentLessonId") ?? "").trim();

  if (!childId || !UUID_RE.test(childId) || !curriculumId || !UUID_RE.test(curriculumId)) {
    return { error: "Invalid child or curriculum." };
  }

  const currentLessonId =
    lessonRaw.length === 0 ? null : UUID_RE.test(lessonRaw) ? lessonRaw : null;
  if (lessonRaw.length > 0 && currentLessonId === null) {
    return { error: "Invalid lesson id." };
  }

  const { supabase, user, parent } = await getParentForUser();
  if (!user || !parent) {
    return { error: "You need to be logged in." };
  }

  const gate = await assertChildAccess(supabase, childId);
  if (!gate.ok) {
    return { error: gate.message };
  }

  const { data: enrollment } = await supabase
    .from("child_curriculum_enrollments")
    .select("curriculum_id")
    .eq("child_id", childId)
    .eq("curriculum_id", curriculumId)
    .eq("is_active", true)
    .maybeSingle();
  if (!enrollment) {
    return { error: "Child is not actively enrolled in this curriculum." };
  }

  if (currentLessonId) {
    const { data: lesson, error: leErr } = await supabase
      .from("lessons")
      .select("id, curriculum_id")
      .eq("id", currentLessonId)
      .maybeSingle();
    if (leErr) {
      return { error: leErr.message };
    }
    if (!lesson || lesson.curriculum_id !== curriculumId) {
      return { error: "Lesson does not belong to this curriculum." };
    }
  }

  const { error } = await supabase.from("child_curriculum_state").upsert(
    {
      child_id: childId,
      curriculum_id: curriculumId,
      current_lesson_id: currentLessonId,
    },
    { onConflict: "child_id,curriculum_id" },
  );
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/parent");
  return { error: null };
}
