-- Convert current_answers column from text to jsonb for exam_participations
BEGIN;

-- If column does not exist yet, create it as jsonb
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='exam_participations' AND column_name='current_answers'
  ) THEN
    ALTER TABLE exam_participations ADD COLUMN current_answers jsonb;
  END IF;
END$$;

-- If column exists and is not jsonb, attempt to cast
ALTER TABLE exam_participations
  ALTER COLUMN current_answers TYPE jsonb USING (
    CASE
      WHEN pg_typeof(current_answers) = 'text'::regtype THEN current_answers::jsonb
      ELSE current_answers
    END
  );

COMMIT;
