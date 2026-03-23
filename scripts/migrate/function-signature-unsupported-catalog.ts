import { type UnsupportedProblemCatalogEntry } from './function-signature-migrate.shared';

/** Exact unsupported problem IDs that must be quarantined out of the function-signature rollout. */
export const unsupportedFunctionSignatureProblems: UnsupportedProblemCatalogEntry[] = [
  {
    problemId: '11dc40e9-c5d0-4681-abb1-c30e8b663f79',
    reason: 'oop_operations',
  },
  {
    problemId: '49cbbc80-e986-4730-9a85-069ab064deb5',
    reason: 'oop_operations',
  },
  {
    problemId: 'c59542ce-a1fd-4fb4-bf60-b1dbaf8f188a',
    reason: 'mislabeled_data',
  },
  {
    problemId: '2052d2c6-058f-4465-a235-79a15e933e8d',
    reason: 'contest_text_input',
  },
  {
    problemId: '511db4c6-6693-4187-8cd4-8d69569f44e0',
    reason: 'contest_text_input',
  },
  {
    problemId: '58bf8606-ec94-45cd-a2c0-7d576b19b255',
    reason: 'contest_text_input',
  },
];
