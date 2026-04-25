import { signOut } from "@/app/auth/actions";
import { AddChildForm } from "@/components/parent/AddChildForm";
import type { LessonOption } from "@/components/parent/CurrentLessonForm";
import { CurrentLessonForm } from "@/components/parent/CurrentLessonForm";
import type { CurriculumPick } from "@/components/parent/EnrollCurriculumForm";
import { EnrollCurriculumForm } from "@/components/parent/EnrollCurriculumForm";
import { ParentChildFlagsForm } from "@/components/parent/ParentChildFlagsForm";
import { ReviewModeSelect } from "@/components/parent/ReviewModeSelect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type EnrollmentRow = {
  child_id: string;
  curriculum_id: string;
  is_active: boolean;
  enrolled_at: string;
  curricula: { id: string; title: string } | null;
};

function stateKey(childId: string, curriculumId: string) {
  return `${childId}:${curriculumId}`;
}

function pickActiveEnrollment(
  rows: EnrollmentRow[],
  childId: string,
): EnrollmentRow | null {
  const active = rows
    .filter((r) => r.child_id === childId && r.is_active)
    .sort(
      (a, b) =>
        new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime(),
    );
  return active[0] ?? null;
}

export default async function ParentHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?next=/parent");
  }

  const { data: parent } = await supabase
    .from("parents")
    .select("id, display_name, email, household_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const householdId = parent?.household_id ?? null;

  const { data: childrenRows } = householdId
    ? await supabase
        .from("children")
        .select("id, display_name, birth_year, primary_culture_id")
        .eq("household_id", householdId)
        .order("created_at", { ascending: true })
    : { data: null as null };

  const { data: culturesRows } = await supabase
    .from("cultures")
    .select("id, name, slug")
    .order("name", { ascending: true });

  const cultures = (culturesRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  const cultureNameById = new Map(cultures.map((c) => [c.id, c.name]));

  type ChildRow = NonNullable<typeof childrenRows>[number];
  const children: ChildRow[] = childrenRows ?? [];

  const { data: curriculaRaw } = await supabase
    .from("curricula")
    .select("id, title, slug, culture_id, cultures(name)")
    .order("sort_order", { ascending: true });

  const curricula: CurriculumPick[] = (curriculaRaw ?? []).map((row) => {
    const raw = row.cultures as unknown;
    let cultureName: string | null = null;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "name" in raw) {
      cultureName = String((raw as { name: string }).name);
    } else if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object" && "name" in raw[0]) {
      cultureName = String((raw[0] as { name: string }).name);
    }
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      cultureName,
    };
  });

  const childIds = children.map((c) => c.id);
  const { data: enrollmentsRaw } =
    parent && childIds.length > 0
      ? await supabase
          .from("child_curriculum_enrollments")
          .select("child_id, curriculum_id, is_active, enrolled_at, curricula(id, title)")
          .in("child_id", childIds)
      : { data: [] as EnrollmentRow[] | null };

  const enrollments: EnrollmentRow[] = (enrollmentsRaw ?? []) as EnrollmentRow[];

  const { data: settingsRaw } = parent
    ? await supabase
        .from("parent_child_settings")
        .select("child_id, review_mode_enabled, flags")
        .eq("parent_id", parent.id)
    : {
        data: [] as {
          child_id: string;
          review_mode_enabled: boolean;
          flags: unknown;
        }[] | null,
      };

  const settingsByChild = new Map<
    string,
    { review: boolean; flags: Record<string, unknown> }
  >();
  for (const s of settingsRaw ?? []) {
    const flags =
      s.flags != null &&
      typeof s.flags === "object" &&
      !Array.isArray(s.flags)
        ? (s.flags as Record<string, unknown>)
        : {};
    settingsByChild.set(s.child_id, {
      review: s.review_mode_enabled,
      flags,
    });
  }

  const activeCurriculumIds = new Set<string>();
  for (const ch of children) {
    const a = pickActiveEnrollment(enrollments, ch.id);
    if (a?.curriculum_id) {
      activeCurriculumIds.add(a.curriculum_id);
    }
  }

  const curriculumIdsList = [...activeCurriculumIds];
  const { data: lessonsRaw } =
    curriculumIdsList.length > 0
      ? await supabase
          .from("lessons")
          .select("id, curriculum_id, title, sequence_order")
          .in("curriculum_id", curriculumIdsList)
          .order("curriculum_id", { ascending: true })
          .order("sequence_order", { ascending: true })
      : { data: [] as { id: string; curriculum_id: string; title: string; sequence_order: number }[] | null };

  const lessonsByCurriculum = new Map<string, LessonOption[]>();
  for (const row of lessonsRaw ?? []) {
    const list = lessonsByCurriculum.get(row.curriculum_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      sequenceOrder: row.sequence_order,
    });
    lessonsByCurriculum.set(row.curriculum_id, list);
  }
  for (const list of lessonsByCurriculum.values()) {
    list.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  }

  const { data: curriculumStateRaw } =
    childIds.length > 0
      ? await supabase
          .from("child_curriculum_state")
          .select("child_id, curriculum_id, current_lesson_id")
          .in("child_id", childIds)
      : { data: [] as { child_id: string; curriculum_id: string; current_lesson_id: string | null }[] | null };

  const currentLessonByStateKey = new Map<string, string | null>();
  for (const row of curriculumStateRaw ?? []) {
    currentLessonByStateKey.set(
      stateKey(row.child_id, row.curriculum_id),
      row.current_lesson_id,
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-100 via-rose-100 to-sky-100 px-6 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-[2rem] bg-white/85 p-8 shadow-xl backdrop-blur-sm">
        <h1 className="text-2xl font-bold text-slate-900">Parent home</h1>
        <p className="mt-2 text-sm text-slate-600">
          Welcome, {parent?.display_name ?? parent?.email ?? user.email ?? "parent"}.
        </p>
        {!parent && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No parent row in the database yet. Try signing up again or contact support. Ensure{" "}
            <code className="rounded bg-amber-100/80 px-1">SUPABASE_SERVICE_ROLE_KEY</code> is set on the
            server.
          </p>
        )}

        {parent && (
          <>
            <section className="mt-8 rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Children & learning</h2>
              {children.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">None yet — add one below.</p>
              ) : (
                <ul className="mt-4 space-y-6">
                  {children.map((ch) => {
                    const cultureLabel =
                      ch.primary_culture_id != null
                        ? cultureNameById.get(ch.primary_culture_id)
                        : undefined;
                    const active = pickActiveEnrollment(enrollments, ch.id);
                    const st = settingsByChild.get(ch.id);
                    const reviewOn = st?.review ?? false;
                    const flagsObj = st?.flags ?? {};
                    const flagsJsonDefault = JSON.stringify(flagsObj, null, 2);
                    const activeCurriculumId = active?.curriculum_id ?? null;
                    const lessonList =
                      activeCurriculumId != null
                        ? (lessonsByCurriculum.get(activeCurriculumId) ?? [])
                        : [];
                    const currentLessonId =
                      activeCurriculumId != null
                        ? (currentLessonByStateKey.get(stateKey(ch.id, activeCurriculumId)) ?? null)
                        : null;
                    return (
                      <li
                        key={ch.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold text-slate-900">{ch.display_name}</span>
                          <span className="text-sm text-slate-500">
                            {ch.birth_year != null ? `b. ${ch.birth_year}` : "Birth year not set"}
                            {cultureLabel ? ` · ${cultureLabel}` : ""}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/?child=${encodeURIComponent(ch.id)}`}
                            className="inline-flex rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
                          >
                            Open voice tutor
                          </Link>
                          <span className="text-xs text-slate-500">UI language:</span>
                          <Link
                            href={`/?child=${encodeURIComponent(ch.id)}&locale=ko`}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                          >
                            한국어
                          </Link>
                          <Link
                            href={`/?child=${encodeURIComponent(ch.id)}&locale=es`}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                          >
                            Español
                          </Link>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          The child id is included automatically. You must stay signed in on this browser — the
                          tutor will not start for guests.
                        </p>
                        {active?.curricula?.title && (
                          <p className="mt-2 text-xs text-slate-600">
                            Active curriculum:{" "}
                            <span className="font-medium text-slate-800">{active.curricula.title}</span>
                          </p>
                        )}
                        <EnrollCurriculumForm
                          key={`enroll-${ch.id}-${active?.curriculum_id ?? "none"}`}
                          childId={ch.id}
                          childName={ch.display_name}
                          curricula={curricula}
                          activeCurriculumId={active?.curriculum_id ?? null}
                        />
                        <ReviewModeSelect
                          key={`review-${ch.id}-${reviewOn ? "1" : "0"}`}
                          childId={ch.id}
                          reviewModeEnabled={reviewOn}
                        />
                        <ParentChildFlagsForm
                          key={`flags-${ch.id}`}
                          childId={ch.id}
                          flagsJsonDefault={flagsJsonDefault}
                        />
                        {activeCurriculumId != null && (
                          <CurrentLessonForm
                            key={`lesson-${ch.id}-${activeCurriculumId}-${currentLessonId ?? ""}`}
                            childId={ch.id}
                            curriculumId={activeCurriculumId}
                            lessons={lessonList}
                            currentLessonId={currentLessonId}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <AddChildForm cultures={cultures} />
          </>
        )}

        <ul className="mt-8 list-inside list-disc text-sm text-slate-700">
          <li>
            <strong>Voice tutor</strong> requires you to be{" "}
            <strong>signed in</strong>. Use the <strong>Open voice tutor</strong> button under a child — it adds
            their id to the URL for you. Optional:{" "}
            <Link href="/?locale=ko" className="font-semibold text-rose-600 underline-offset-2 hover:underline">
              <code className="rounded bg-slate-100 px-1">?locale=ko</code>
            </Link>{" "}
            or{" "}
            <Link href="/?locale=es" className="font-semibold text-rose-600 underline-offset-2 hover:underline">
              <code className="rounded bg-slate-100 px-1">?locale=es</code>
            </Link>{" "}
            for tutor language, or <code className="rounded bg-slate-100 px-1">?culture=…</code> from your catalog.
          </li>
          <li>
            If you have more than one child, the tutor home asks who is practicing; with one child it picks them
            automatically.
          </li>
        </ul>
        <form action={signOut} className="mt-8">
          <button
            type="submit"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
