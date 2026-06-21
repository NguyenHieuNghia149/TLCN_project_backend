import {
  invalidRegistrationWindowCountSql,
  invalidRegistrationWindowRemediationSql,
  invalidRegistrationWindowSelectSql,
} from '../../../scripts/exam-access-redesign-data';

describe('exam access redesign data checks', () => {
  it('audits every non-invite exam with missing or invalid registration windows', () => {
    expect(invalidRegistrationWindowSelectSql).toContain("access_mode <> 'invite_only'");
    expect(invalidRegistrationWindowSelectSql).toContain('registration_open_at IS NULL');
    expect(invalidRegistrationWindowSelectSql).toContain('registration_close_at IS NULL');
    expect(invalidRegistrationWindowSelectSql).toContain('registration_close_at <= registration_open_at');
    expect(invalidRegistrationWindowSelectSql).toContain('registration_open_at >= start_date');
    expect(invalidRegistrationWindowSelectSql).toContain('registration_close_at >= start_date');
    expect(invalidRegistrationWindowCountSql).toContain("access_mode <> 'invite_only'");
  });

  it('remediates invalid self-registration windows by quarantining exams from public registration', () => {
    expect(invalidRegistrationWindowRemediationSql).toContain("access_mode = 'invite_only'");
    expect(invalidRegistrationWindowRemediationSql).toContain('self_registration_approval_mode = NULL');
    expect(invalidRegistrationWindowRemediationSql).toContain(
      'self_registration_password_required = false',
    );
    expect(invalidRegistrationWindowRemediationSql).toContain('is_visible = false');
    expect(invalidRegistrationWindowRemediationSql).toContain("WHEN status = 'published' THEN 'draft'");
  });
});
