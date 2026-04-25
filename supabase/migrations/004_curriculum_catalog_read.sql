-- Let signed-in parents read curriculum catalog (enrollment UI, tutor metadata).
DROP POLICY IF EXISTS curricula_read_authenticated ON curricula;
CREATE POLICY curricula_read_authenticated
  ON curricula FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS lessons_read_authenticated ON lessons;
CREATE POLICY lessons_read_authenticated
  ON lessons FOR SELECT TO authenticated
  USING (true);
