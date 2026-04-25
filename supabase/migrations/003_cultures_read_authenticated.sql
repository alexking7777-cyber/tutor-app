-- Reference data: parents pick heritage culture when adding a child.
DROP POLICY IF EXISTS cultures_select_authenticated ON cultures;

CREATE POLICY cultures_select_authenticated
  ON cultures FOR SELECT TO authenticated
  USING (true);
