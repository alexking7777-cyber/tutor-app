-- voicebot: heritage language tutor — initial relational schema
-- Run in Supabase SQL Editor or via CLI migrations.
-- Culture ↔ Curriculum are separated for multi-culture expansion (e.g. Spanish/Hispanic etiquette).

-- ---------------------------------------------------------------------------
-- Extensions (gen_random_uuid; optional pgcrypto)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_progress_status') THEN
    CREATE TYPE lesson_progress_status AS ENUM (
      'not_started',
      'in_progress',
      'completed',
      'skipped'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Culture: identity / etiquette context (expandable per diaspora)
-- ---------------------------------------------------------------------------
CREATE TABLE cultures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  -- e.g. default locale tags, etiquette notes, JSON metadata for tutors
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cultures_slug ON cultures (slug);

-- ---------------------------------------------------------------------------
-- Curriculum: teaching program (logically under a culture, reusable ordering)
-- ---------------------------------------------------------------------------
CREATE TABLE curricula (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  culture_id      UUID NOT NULL REFERENCES cultures (id) ON DELETE RESTRICT,
  slug            TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  level           TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (culture_id, slug)
);

CREATE INDEX idx_curricula_culture ON curricula (culture_id);

-- ---------------------------------------------------------------------------
-- Lesson (과): atomic unit of learning within a curriculum
-- ---------------------------------------------------------------------------
CREATE TABLE lessons (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id           UUID NOT NULL REFERENCES curricula (id) ON DELETE CASCADE,
  slug                    TEXT NOT NULL,
  title                   TEXT NOT NULL,
  sequence_order          INT NOT NULL DEFAULT 0,
  objectives              JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes       INT,
  content_metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, slug)
);

CREATE INDEX idx_lessons_curriculum_seq ON lessons (curriculum_id, sequence_order);

-- ---------------------------------------------------------------------------
-- Households & parents (parent controls; link auth.users when you add Supabase Auth)
-- ---------------------------------------------------------------------------
CREATE TABLE households (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    TEXT,
  timezone        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE parents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  email           TEXT UNIQUE,
  display_name    TEXT,
  -- optional: REFERENCES auth.users(id) ON DELETE CASCADE when using Supabase Auth
  auth_user_id    UUID UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parents_household ON parents (household_id);

-- ---------------------------------------------------------------------------
-- Children: learner profiles
-- ---------------------------------------------------------------------------
CREATE TABLE children (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id            UUID NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  display_name            TEXT NOT NULL,
  birth_year              INT,
  -- primary heritage / default tutor culture (can differ from active curriculum culture)
  primary_culture_id      UUID REFERENCES cultures (id) ON DELETE SET NULL,
  avatar_url              TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_children_household ON children (household_id);

-- ---------------------------------------------------------------------------
-- Enrollment: which curriculum a child is following
-- ---------------------------------------------------------------------------
CREATE TABLE child_curriculum_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        UUID NOT NULL REFERENCES children (id) ON DELETE CASCADE,
  curriculum_id   UUID NOT NULL REFERENCES curricula (id) ON DELETE CASCADE,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (child_id, curriculum_id)
);

CREATE INDEX idx_enrollments_child ON child_curriculum_enrollments (child_id);

-- ---------------------------------------------------------------------------
-- Per-lesson progress (resume next day; not always from lesson 1)
-- ---------------------------------------------------------------------------
CREATE TABLE child_lesson_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            UUID NOT NULL REFERENCES children (id) ON DELETE CASCADE,
  lesson_id           UUID NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  status              lesson_progress_status NOT NULL DEFAULT 'not_started',
  -- e.g. last scene, dialogue turn, rubric checkpoint, tutor checkpoint id
  progress_state      JSONB NOT NULL DEFAULT '{}'::jsonb,
  minutes_practiced   INT NOT NULL DEFAULT 0,
  last_session_at     TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_id, lesson_id)
);

CREATE INDEX idx_child_lesson_progress_child ON child_lesson_progress (child_id);
CREATE INDEX idx_child_lesson_progress_lesson ON child_lesson_progress (lesson_id);
CREATE INDEX idx_child_lesson_progress_resume ON child_lesson_progress (child_id, last_session_at DESC NULLS LAST);

-- Denormalized pointer: current lesson for fast reads (optional but practical for UX)
CREATE TABLE child_curriculum_state (
  child_id            UUID NOT NULL REFERENCES children (id) ON DELETE CASCADE,
  curriculum_id       UUID NOT NULL REFERENCES curricula (id) ON DELETE CASCADE,
  current_lesson_id   UUID REFERENCES lessons (id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, curriculum_id)
);

CREATE INDEX idx_curriculum_state_current ON child_curriculum_state (current_lesson_id);

-- ---------------------------------------------------------------------------
-- Session memory: post-session summary + weak points (accumulated history)
-- ---------------------------------------------------------------------------
CREATE TABLE tutor_session_summaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id            UUID NOT NULL REFERENCES children (id) ON DELETE CASCADE,
  culture_id          UUID REFERENCES cultures (id) ON DELETE SET NULL,
  curriculum_id       UUID REFERENCES curricula (id) ON DELETE SET NULL,
  lesson_id           UUID REFERENCES lessons (id) ON DELETE SET NULL,
  session_started_at  TIMESTAMPTZ NOT NULL,
  session_ended_at    TIMESTAMPTZ NOT NULL,
  duration_seconds    INT NOT NULL CHECK (duration_seconds >= 0),
  summary             TEXT NOT NULL,
  -- structured weak signals: [{ "kind": "tone", "detail": "...", "example": "..." }, ...]
  weak_points         JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths           JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_summaries_child_time ON tutor_session_summaries (child_id, session_ended_at DESC);

-- Rolling aggregate (optional fast path for tutor context injection)
CREATE TABLE child_learning_memory (
  child_id            UUID PRIMARY KEY REFERENCES children (id) ON DELETE CASCADE,
  cumulative_summary  TEXT,
  weak_points_latest  JSONB NOT NULL DEFAULT '[]'::jsonb,
  weak_points_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  session_count         INT NOT NULL DEFAULT 0,
  last_session_at     TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Parent controls: review mode and future flags (per parent–child)
-- ---------------------------------------------------------------------------
CREATE TABLE parent_child_settings (
  parent_id               UUID NOT NULL REFERENCES parents (id) ON DELETE CASCADE,
  child_id                UUID NOT NULL REFERENCES children (id) ON DELETE CASCADE,
  review_mode_enabled     BOOLEAN NOT NULL DEFAULT false,
  -- future: strict_mode, content_filter_level, notification prefs, etc.
  flags                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, child_id)
);

CREATE INDEX idx_parent_child_settings_child ON parent_child_settings (child_id);

-- ---------------------------------------------------------------------------
-- updated_at touch helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to mutable tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cultures','curricula','lessons','households','parents','children',
    'child_lesson_progress','child_curriculum_state','child_learning_memory',
    'parent_child_settings'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
    ', t, t, t, t);
  END LOOP;
END$$;

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- Enable now; add policies when Supabase Auth is wired (household/parent claims).
-- Service role key bypasses RLS for trusted server routes.
-- ---------------------------------------------------------------------------
ALTER TABLE cultures ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_curriculum_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_curriculum_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_learning_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_child_settings ENABLE ROW LEVEL SECURITY;

-- Optional seed row for local testing (remove or adjust in production)
-- INSERT INTO cultures (slug, name, description) VALUES
--   ('korean-american', 'Korean American heritage', 'Language + etiquette for Korean diaspora families');

COMMENT ON TABLE cultures IS 'Cultural / etiquette context; separate from curriculum for multi-culture expansion.';
COMMENT ON TABLE curricula IS 'Teaching program under a culture; references culture_id.';
COMMENT ON TABLE child_lesson_progress IS 'Per-lesson resume state so sessions do not restart from zero each day.';
COMMENT ON TABLE tutor_session_summaries IS 'Append-only session outcomes: summary + weak points after each voice session.';
COMMENT ON TABLE child_learning_memory IS 'Rolling tutor-facing memory derived from sessions (optional denormalized cache).';
COMMENT ON TABLE parent_child_settings IS 'Parent toggles such as review_mode per child.';
