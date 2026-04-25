-- Parents can read/write current-lesson pointer for their children.
DROP POLICY IF EXISTS child_curriculum_state_select ON child_curriculum_state;
DROP POLICY IF EXISTS child_curriculum_state_insert ON child_curriculum_state;
DROP POLICY IF EXISTS child_curriculum_state_update ON child_curriculum_state;

CREATE POLICY child_curriculum_state_select
  ON child_curriculum_state FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.household_id = c.household_id
      WHERE c.id = child_curriculum_state.child_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY child_curriculum_state_insert
  ON child_curriculum_state FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.household_id = c.household_id
      WHERE c.id = child_curriculum_state.child_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY child_curriculum_state_update
  ON child_curriculum_state FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.household_id = c.household_id
      WHERE c.id = child_curriculum_state.child_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM children c
      JOIN parents p ON p.household_id = c.household_id
      WHERE c.id = child_curriculum_state.child_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );
