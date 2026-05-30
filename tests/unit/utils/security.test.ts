import fs from 'node:fs';
import path from 'node:path';
import { PasswordUtils, TokenUtils } from '@backend/shared/utils/security';
import { logger } from '@backend/shared/utils/logger';

describe('PasswordUtils', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBcryptSaltRounds = process.env.BCRYPT_SALT_ROUNDS;

  beforeEach(() => {
    PasswordUtils.resetSaltRoundWarningForTests();
    process.env.NODE_ENV = 'test';
    delete process.env.BCRYPT_SALT_ROUNDS;
  });

  afterEach(() => {
    jest.restoreAllMocks();

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalBcryptSaltRounds === undefined) {
      delete process.env.BCRYPT_SALT_ROUNDS;
    } else {
      process.env.BCRYPT_SALT_ROUNDS = originalBcryptSaltRounds;
    }
  });

  it('uses native bcrypt for password operations', () => {
    const securitySource = fs.readFileSync(
      path.resolve(__dirname, '../../../packages/shared/utils/security.ts'),
      'utf8',
    );

    expect(securitySource).toContain("from 'bcrypt'");
    expect(securitySource).not.toContain("from 'bcryptjs'");
  });

  it('verifies bcrypt-format password hashes without changing the public behavior', async () => {
    process.env.BCRYPT_SALT_ROUNDS = '12';

    const hash = await PasswordUtils.hashPassword('StrongPass1!');

    expect(hash.startsWith('$2')).toBe(true);
    await expect(PasswordUtils.comparePassword('StrongPass1!', hash)).resolves.toBe(true);
    await expect(PasswordUtils.comparePassword('WrongPass1!', hash)).resolves.toBe(false);
  });

  it('uses default bcrypt rounds when env is not set', () => {
    delete process.env.BCRYPT_SALT_ROUNDS;

    expect(PasswordUtils.getSaltRounds()).toBe(12);
  });

  it('rejects invalid BCRYPT_SALT_ROUNDS values', () => {
    process.env.BCRYPT_SALT_ROUNDS = 'abc';

    expect(() => PasswordUtils.getSaltRounds()).toThrow(
      'Invalid BCRYPT_SALT_ROUNDS. Expected integer between 4 and 14.',
    );
  });

  it('warns when BCRYPT_SALT_ROUNDS is below production strength outside production', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    process.env.NODE_ENV = 'test';
    process.env.BCRYPT_SALT_ROUNDS = '10';

    expect(PasswordUtils.getSaltRounds()).toBe(10);
    expect(warnSpy).toHaveBeenCalledWith('BCRYPT_SALT_ROUNDS is below production strength', {
      bcryptRounds: 10,
      minimumProductionRounds: 12,
      nodeEnv: 'test',
    });
  });

  it('reads BCRYPT_SALT_ROUNDS from env', () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    process.env.BCRYPT_SALT_ROUNDS = '10';

    expect(PasswordUtils.getSaltRounds()).toBe(10);
  });

  it('rejects BCRYPT_SALT_ROUNDS below production strength in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.BCRYPT_SALT_ROUNDS = '10';

    expect(() => PasswordUtils.getSaltRounds()).toThrow(
      'BCRYPT_SALT_ROUNDS cannot be below 12 in production.',
    );
  });
});

describe('TokenUtils', () => {
  it('generates opaque refresh tokens as UUID v4 strings', () => {
    const token = TokenUtils.generateOpaqueRefreshToken();

    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(token).not.toContain('.');
  });

  it('does not expose the old ambiguous refresh-token helper name', () => {
    expect((TokenUtils as any).generateRefreshToken).toBeUndefined();
  });
});
