jest.mock('../../../apps/sandbox/src/sandbox.service', () => ({
  sandboxService: {
    executeCode: jest.fn(),
  },
}));

import { validateWrapperExecutionMode } from '../../../apps/sandbox/src/grpc/server';

describe('sandbox gRPC execution_mode compatibility', () => {
  it('accepts wrapper-compatible execution_mode values', () => {
    expect(validateWrapperExecutionMode('wrapper')).toBeNull();
    expect(validateWrapperExecutionMode(undefined)).toBeNull();
    expect(validateWrapperExecutionMode('')).toBeNull();
  });

  it('rejects unsupported execution_mode values', () => {
    expect(validateWrapperExecutionMode('legacy')).toBe(
      "execution_mode must be 'wrapper' or unset; got: legacy"
    );
    expect(validateWrapperExecutionMode(null)).toBe(
      "execution_mode must be 'wrapper' or unset; got: null"
    );
  });
});