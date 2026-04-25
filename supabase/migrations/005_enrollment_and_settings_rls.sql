-- Enrollments: parents can manage their children's curriculum rows.
DROP POLICY IF EXISTS child_curriculum_enrollments_insert ON child_curriculum_enrollments;
DROP POLICY IF EXISTS child_curriculum_enrollments_update ON child_curriculum_enrollments;

CREATE POLICY child_curriculum_enrollments_insert
  ON child_curriculum_enrollments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.household_id = c.household_id
      WHERE c.id = child_curriculum_enrollments.child_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY child_curriculum_enrollments_update
  ON child_curriculum_enrollments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.household_id = c.household_id
      WHERE c.id = child_curriculum_enrollments.child_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.household_id = c.household_id
      WHERE c.id = child_curriculum_enrollments.child_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

-- Tighten parent_child_settings: child must belong to the same household as the parent row.
DROP POLICY IF EXISTS parent_child_settings_insert ON parent_child_settings;
DROP POLICY IF EXISTS parent_child_settings_update ON parent_child_settings;

CREATE POLICY parent_child_settings_insert
  ON parent_child_settings FOR INSERT TO authenticated
  WITH CHECK (
    parent_id IN (SELECT id FROM parents WHERE auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM children c
      JOIN parents p ON p.id = parent_child_settings.parent_id
      WHERE c.id = parent_child_settings.child_id
        AND c.household_id = p.household_id
    )
  );

CREATE POLICY parent_child_settings_update
  ON parent_child_settings FOR UPDATE TO authenticated
  USING (
    parent_id IN (SELECT id FROM parents WHERE auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM children c
      JOIN parents p ON p.id = parent_child_settings.parent_id
      WHERE c.id = parent_child_settings.child_id
        AND c.household_id = p.household_id
    )
  )
  WITH CHECK (
    parent_id IN (SELECT id FROM parents WHERE auth_user_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM children c
      JOIN parents p ON p.id = parent_child_settings.parent_id
      WHERE c.id = parent_child_settings.child_id
        AND c.household_id = p.household_id
    )
  );
