# Exam Feature — Sequence Diagram (Mermaid)

Below is a Mermaid sequence diagram illustrating the main exam flows: start participation, autosave/sync, resume, submit, admin create exam (atomic create problems), and auto-submit.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Frontend
    participant Controller
    participant Service
    participant ExamParticipationRepo as ParticipationRepository
    participant ExamRepo as ExamRepository
    participant ProblemRepo as ProblemRepository
    participant DB
    participant Grader as GradingService
    participant Scheduler

    %% Start participation flow
    Client->>Frontend: Click "Start Exam"
    Frontend->>Controller: POST /exams/:examId/participations
    Controller->>Service: validate + createParticipation
    Service->>ExamParticipationRepo: createParticipation(examId, userId)
    ExamParticipationRepo->>DB: INSERT INTO exam_participations
    DB-->>ExamParticipationRepo: participation record
    ExamParticipationRepo-->>Service: participation(sessionId, expiresAt)
    Service-->>Controller: participation
    Controller-->>Frontend: 200 {sessionId, expiresAt}
    Frontend-->>Client: show timer based on expiresAt

    %% Autosave / Sync flow
    Frontend->>Controller: PUT /participations/:sessionId/sync {currentAnswers}
    Controller->>Service: validate session, merge answers
    Service->>ExamParticipationRepo: updateCurrentAnswers(sessionId, partialAnswers)
    ExamParticipationRepo->>DB: UPDATE exam_participations SET current_answers=..., last_synced_at=NOW()
    DB-->>ExamParticipationRepo: OK
    ExamParticipationRepo-->>Service: OK
    Service-->>Controller: {ok, expiresAt}
    Controller-->>Frontend: {ok, expiresAt, serverTime}

    %% Resume flow
    Frontend->>Controller: GET /participations/:sessionId
    Controller->>Service: fetchParticipation(sessionId)
    Service->>ExamParticipationRepo: findBySessionId(sessionId)
    ExamParticipationRepo->>DB: SELECT * FROM exam_participations WHERE session_id=...
    DB-->>ExamParticipationRepo: participation
    ExamParticipationRepo-->>Service: participation
    Service-->>Controller: participation
    Controller-->>Frontend: {currentAnswers, expiresAt, isSubmitted}

    %% Submit flow
    Frontend->>Controller: POST /participations/:sessionId/submit
    Controller->>Service: validate + submit(participation)
    Service->>ExamParticipationRepo: markSubmitted(sessionId)
    ExamParticipationRepo->>DB: UPDATE is_submitted=true, submitted_at=NOW()
    DB-->>ExamParticipationRepo: OK
    Service->>Grader: gradeSubmission(participationId)
    Grader->>DB: INSERT submissions / run testcases / compute score
    DB-->>Grader: score
    Grader-->>Service: {score, details}
    Service-->>Controller: {success, score}
    Controller-->>Frontend: {success, score}

    %% Admin: Create exam with problems (atomic)
    AdminClient->>Frontend: Admin creates exam + problems
    Frontend->>Controller: POST /admin/exams {exam, challenges}
    Controller->>Service: validate input
    Service->>ExamRepo: createExamWithChallenges(examData, challenges)
    ExamRepo->>DB: BEGIN TRANSACTION
    ExamRepo->>DB: INSERT INTO exams (...) RETURNING id
    DB-->>ExamRepo: examId
    loop for each challenge
        ExamRepo->>ProblemRepo: createProblemTransactional(challenge, tx)
        ProblemRepo->>DB: INSERT problems, testcases, solutions (using same tx)
        DB-->>ProblemRepo: problemId
        ProblemRepo-->>ExamRepo: problemId
        ExamRepo->>DB: INSERT INTO exam_to_problems (examId, problemId)
    end
    ExamRepo->>DB: COMMIT
    DB-->>ExamRepo: COMMIT OK
    ExamRepo-->>Service: examCreated
    Service-->>Controller: 201 {examId}
    Controller-->>AdminClient: 201

    %% Auto-submit scheduled job
    Scheduler->>Service: trigger autoSubmitExpiredParticipations
    Service->>ExamParticipationRepo: findExpiredNotSubmitted(now)
    ExamParticipationRepo->>DB: SELECT ... WHERE expires_at <= now AND is_submitted = false
    DB-->>ExamParticipationRepo: list of participations
    loop for each expired participation
        Service->>ExamParticipationRepo: markSubmitted(participationId)
        Service->>Grader: gradeSubmission(participationId)
    end

    Note over Service,ExamParticipationRepo: All important state stored server-side (sessionId, expiresAt, currentAnswers). Client shows timer and triggers periodic syncs, but server enforces final decisions.
```

Notes:

- Repository methods accept an optional `tx` parameter so `ExamRepository` can compose a single transaction that calls `ProblemRepository.createProblemTransactional(..., tx)` for atomicity.
- Server time is authoritative for expiry checks; client timestamps are auxiliary only.
- You can paste this Mermaid block into any Markdown that supports Mermaid (e.g., GitHub with Mermaid enabled, or a docs site that renders Mermaid).
