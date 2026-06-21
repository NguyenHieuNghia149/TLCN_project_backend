import fs from 'node:fs';
import path from 'node:path';

describe('ExamParticipationRepository', () => {
  it('guards sync updates with active participation predicates', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../apps/api/src/repositories/examParticipation.repository.ts'),
      'utf8',
    );

    expect(source).toContain('eq(examParticipations.status, EExamParticipationStatus.IN_PROGRESS)');
    expect(source).toContain('isNull(examParticipations.expiresAt)');
    expect(source).toContain('gte(examParticipations.expiresAt, data.lastSyncedAt)');
    expect(source).toContain('return rows.length === 1');
  });
});
