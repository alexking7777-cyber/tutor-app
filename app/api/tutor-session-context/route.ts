import {
  buildCurriculumContextBlock,
  buildCurriculumKickoffUserText,
  buildCurriculumTopicLabel,
  summarizeLessonObjectives,
} from "@/lib/tutor/curriculumContextForSystemInstruction";
import { resolveTutorUiLocale } from "@/lib/i18n/tutorLocale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const childId = url.searchParams.get("childId")?.trim() ?? "";
  const locale = resolveTutorUiLocale({
    localeParam: url.searchParams.get("locale"),
    cultureParam: url.searchParams.get("culture"),
  });

  if (!childId || !UUID_RE.test(childId)) {
    return NextResponse.json({
      contextBlock: null as string | null,
      topicLabel: null as string | null,
      kickoffUserText: null as string | null,
      reason: "invalid_child_id",
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { contextBlock: null, topicLabel: null, kickoffUserText: null, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const { data: parent } = await supabase
    .from("parents")
    .select("id, household_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!parent?.household_id) {
    return NextResponse.json(
      { contextBlock: null, topicLabel: null, kickoffUserText: null, reason: "no_parent" },
      { status: 403 },
    );
  }

  const { data: child } = await supabase
    .from("children")
    .select("id, household_id")
    .eq("id", childId)
    .maybeSingle();

  if (!child || child.household_id !== parent.household_id) {
    return NextResponse.json(
      { contextBlock: null, topicLabel: null, kickoffUserText: null, reason: "forbidden" },
      { status: 403 },
    );
  }

  const { data: enrollment } = await supabase
    .from("child_curriculum_enrollments")
    .select("curriculum_id")
    .eq("child_id", childId)
    .eq("is_active", true)
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!enrollment?.curriculum_id) {
    return NextResponse.json({
      contextBlock: null,
      topicLabel: null,
      kickoffUserText: null,
      reason: "no_active_curriculum",
    });
  }

  const curriculumId = enrollment.curriculum_id;

  const { data: curriculum } = await supabase
    .from("curricula")
    .select("title")
    .eq("id", curriculumId)
    .maybeSingle();

  if (!curriculum?.title) {
    return NextResponse.json({
      contextBlock: null,
      topicLabel: null,
      kickoffUserText: null,
      reason: "no_curriculum",
    });
  }

  const { data: state } = await supabase
    .from("child_curriculum_state")
    .select("current_lesson_id")
    .eq("child_id", childId)
    .eq("curriculum_id", curriculumId)
    .maybeSingle();

  let lessonRow: {
    id: string;
    title: string;
    slug: string;
    sequence_order: number;
    objectives: unknown;
  } | null = null;

  const pointer = state?.current_lesson_id ?? null;
  if (pointer) {
    const { data: byId } = await supabase
      .from("lessons")
      .select("id, title, slug, sequence_order, objectives, curriculum_id")
      .eq("id", pointer)
      .maybeSingle();
    if (byId && byId.curriculum_id === curriculumId) {
      lessonRow = byId;
    }
  }

  if (!lessonRow) {
    const { data: first } = await supabase
      .from("lessons")
      .select("id, title, slug, sequence_order, objectives")
      .eq("curriculum_id", curriculumId)
      .order("sequence_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    lessonRow = first;
  }

  if (!lessonRow) {
    return NextResponse.json({
      contextBlock: null,
      topicLabel: null,
      kickoffUserText: null,
      reason: "no_lessons_in_catalog",
    });
  }

  const input = {
    curriculumTitle: curriculum.title,
    lessonTitle: lessonRow.title,
    lessonSlug: lessonRow.slug,
    sequenceOrder: lessonRow.sequence_order,
    objectivesSummary: summarizeLessonObjectives(lessonRow.objectives),
  };

  const contextBlock = buildCurriculumContextBlock(locale, input);
  const topicLabel = buildCurriculumTopicLabel(locale, input);
  const kickoffUserText = buildCurriculumKickoffUserText(locale, input);

  return NextResponse.json({
    contextBlock,
    topicLabel,
    kickoffUserText,
    reason: null as string | null,
    lessonId: lessonRow.id,
    curriculumId,
  });
}
