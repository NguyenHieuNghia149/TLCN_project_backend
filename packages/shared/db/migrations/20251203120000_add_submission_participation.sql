-- Add exam_participation_id to submissions
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS exam_participation_id UUID NULL;

ALTER TABLE submissions
  ADD CONSTRAINT IF NOT EXISTS fk_submissions_exam_participation
    FOREIGN KEY (exam_participation_id)
    REFERENCES exam_participations(id);

CREATE INDEX IF NOT EXISTS idx_submissions_participation_problem_submitted_at
  ON submissions (exam_participation_id, problem_id, submitted_at DESC);
