-- Merge session fields into exam_participations
BEGIN;

ALTER TABLE exam_participations
  ADD COLUMN IF NOT EXISTS submitted_at timestamp,
  ADD COLUMN IF NOT EXISTS expires_at timestamp,
  ADD COLUMN IF NOT EXISTS current_answers text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamp,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'IN_PROGRESS',
  ADD COLUMN IF NOT EXISTS score integer;

-- Backfill status: mark already completed participations as SUBMITTED
UPDATE exam_participations SET status = 'SUBMITTED' WHERE is_completed = true;

-- Ensure remaining rows have a status
UPDATE exam_participations SET status = 'IN_PROGRESS' WHERE status IS NULL;

-- Ensure only one IN_PROGRESS participation per (exam_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_participations_one_in_progress_per_user_exam
  ON exam_participations (exam_id, user_id)
  WHERE status = 'IN_PROGRESS';

COMMIT;
