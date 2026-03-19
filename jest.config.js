module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@backend/shared$': '<rootDir>/packages/shared/index.ts',
    '^@backend/shared/db$': '<rootDir>/packages/shared/db/index.ts',
    '^@backend/shared/types$': '<rootDir>/packages/shared/types/index.ts',
    '^@backend/shared/utils$': '<rootDir>/packages/shared/utils/index.ts',
    '^@backend/shared/validations$': '<rootDir>/packages/shared/validations/index.ts',
    '^@backend/shared/(.*)$': '<rootDir>/packages/shared/$1',
    '^@backend/api/(.*)$': '<rootDir>/apps/api/src/$1',
    '^@backend/worker/(.*)$': '<rootDir>/apps/worker/src/$1',
    '^@backend/sandbox/(.*)$': '<rootDir>/apps/sandbox/src/$1',
    '^@backend/database/(.*)$': '<rootDir>/packages/database/src/$1',
  },
  moduleDirectories: ['node_modules', '<rootDir>'],
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};