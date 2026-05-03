export type InvalidRegistrationWindowRow = {
  id: string;
  title: string;
  status: string;
  is_visible: boolean;
  access_mode: string;
  self_registration_approval_mode: string | null;
  registration_open_at: Date | null;
  registration_close_at: Date | null;
  start_date: Date;
  reason: string;
};

export const invalidRegistrationWindowWhereClause = `
  access_mode <> 'invite_only'
  AND (
    registration_open_at IS NULL
    OR registration_close_at IS NULL
    OR registration_close_at <= registration_open_at
    OR registration_open_at >= start_date
    OR registration_close_at >= start_date
  )
`;

export const invalidRegistrationWindowSelectSql = `
  SELECT
    id,
    title,
    status,
    is_visible,
    access_mode,
    self_registration_approval_mode,
    registration_open_at,
    registration_close_at,
    start_date,
    CASE
      WHEN registration_open_at IS NULL AND registration_close_at IS NULL
        THEN 'missing_registration_window'
      WHEN registration_open_at IS NULL
        THEN 'missing_registration_open_at'
      WHEN registration_close_at IS NULL
        THEN 'missing_registration_close_at'
      WHEN registration_close_at <= registration_open_at
        THEN 'registration_close_not_after_open'
      WHEN registration_open_at >= start_date
        THEN 'registration_open_not_before_start'
      WHEN registration_close_at >= start_date
        THEN 'registration_close_not_before_start'
      ELSE 'unknown'
    END AS reason
  FROM exam
  WHERE ${invalidRegistrationWindowWhereClause}
  ORDER BY id ASC
`;

export const invalidRegistrationWindowCountSql = `
  SELECT COUNT(*)::text AS count
  FROM exam
  WHERE ${invalidRegistrationWindowWhereClause}
`;

export const invalidRegistrationWindowRemediationSql = `
  UPDATE exam
  SET access_mode = 'invite_only',
      self_registration_approval_mode = NULL,
      self_registration_password_required = false,
      registration_password = NULL,
      is_visible = false,
      status = CASE
        WHEN status = 'published' THEN 'draft'
        ELSE status
      END,
      updated_at = NOW()
  WHERE ${invalidRegistrationWindowWhereClause}
`;
