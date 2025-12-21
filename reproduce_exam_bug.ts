import 'dotenv/config';
import { ExamService } from './src/services/exam.service';
import { ProblemRepository } from './src/repositories/problem.repository';
import { CreateExamInput } from './src/validations/exam.validation';
import { randomUUID } from 'crypto';

async function main() {
  console.log('--- Starting Reproduction Script ---');

  const examService = new ExamService();
  const problemRepo = new ProblemRepository();

  // 1. Create a dummy problem
  const problemInput = {
    title: `Repro Problem ${randomUUID()}`,
    description: 'Test Description',
    difficulty: 'easy',
    constraint: 'None',
    tags: ['test'],
    lessonid: null,
    topicid: null,
    visibility: 'public',
    testcases: [],
    solution: null,
  };

  console.log('Creating problem...');
  const { problem } = await problemRepo.createProblemTransactional(problemInput as any);
  console.log('Problem created:', problem.id);

  // 2. Create an exam linking to this problem
  const examInput: CreateExamInput = {
    title: `Repro Exam ${randomUUID()}`,
    password: '123',
    duration: 60,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 3600000).toISOString(),
    isVisible: true,
    maxAttempts: 1,
    challenges: [
      {
        type: 'existing',
        challengeId: problem.id,
        orderIndex: 0,
      },
    ],
  };

  console.log('Creating exam with challenge...');
  const exam = await examService.createExam(examInput);
  console.log('Exam created:', exam.id);
  console.log('Initial Challenges count:', exam.challenges?.length);

  if (exam.challenges?.length !== 1) {
    console.error('FAILED: Exam created but challenge not returned immediately.');
  }

  // 3. Fetch exam by ID
  console.log('Fetching exam by ID...');
  const fetchedExam = await examService.getExamById(exam.id);
  console.log('Fetched Challenges count:', fetchedExam.challenges?.length);

  if (!fetchedExam.challenges || fetchedExam.challenges.length !== 1) {
    console.error('FAILED: Fetched exam does not have the challenge.');
  } else {
    console.log('SUCCESS: Challenge persisted correctly.');
    console.log('Challenge in exam:', fetchedExam.challenges[0]);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
