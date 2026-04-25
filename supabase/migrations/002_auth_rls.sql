-- Auth ↔ public.parents + household read path for logged-in parents
-- Run after 001_initial_schema.sql

ALTER TABLE parents
  DROP CONSTRAINT IF EXISTS parents_auth_user_id_fkey;

ALTER TABLE parents
  ADD CONSTRAINT parents_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

DROP POLICY IF EXISTS households_select_member ON households;
DROP POLICY IF EXISTS parents_select_own ON parents;
DROP POLICY IF EXISTS parents_update_own ON parents;
DROP POLICY IF EXISTS children_select_household ON children;
DROP POLICY IF EXISTS children_insert_household ON children;
DROP POLICY IF EXISTS child_curriculum_enrollments_select ON child_curriculum_enrollments;
DROP POLICY IF EXISTS parent_child_settings_select ON parent_child_settings;
DROP POLICY IF EXISTS parent_child_settings_insert ON parent_child_settings;
DROP POLICY IF EXISTS parent_child_settings_update ON parent_child_settings;

CREATE POLICY households_select_member
  ON households FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents p
      WHERE p.household_id = households.id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY parents_select_own
  ON parents FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

CREATE POLICY parents_update_own
  ON parents FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY children_select_household
  ON children FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parents p
      WHERE p.household_id = children.household_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY children_insert_household
  ON children FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM parents p
      WHERE p.household_id = children.household_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY child_curriculum_enrollments_select
  ON child_curriculum_enrollments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.household_id = c.household_id
      WHERE c.id = child_curriculum_enrollments.child_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY parent_child_settings_select
  ON parent_child_settings FOR SELECT TO authenticated
  USING (
    parent_id IN (SELECT id FROM parents WHERE auth_user_id = (SELECT auth.uid()))
  );

CREATE POLICY parent_child_settings_insert
  ON parent_child_settings FOR INSERT TO authenticated
  WITH CHECK (
    parent_id IN (SELECT id FROM parents WHERE auth_user_id = (SELECT auth.uid()))
  );

CREATE POLICY parent_child_settings_update
  ON parent_child_settings FOR UPDATE TO authenticated
  USING (
    parent_id IN (SELECT id FROM parents WHERE auth_user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    parent_id IN (SELECT id FROM parents WHERE auth_user_id = (SELECT auth.uid()))
  );
