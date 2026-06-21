export enum EExamParticipationStatus {
  IN_PROGRESS = 'IN_PROGRESS', // Exam started but not submitted
  SUBMITTED = 'SUBMITTED', // Exam submitted by user
  EXPIRED = 'EXPIRED', // Exam time expired, auto-submitted
  ABANDONED = 'ABANDONED', // User left without submitting (future use)
}
