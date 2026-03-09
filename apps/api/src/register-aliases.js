// Register path aliases for runtime
require('tsconfig-paths').register({
  baseUrl: '.',
  paths: {
    '@/*': ['./dist/src/*']
  }
});