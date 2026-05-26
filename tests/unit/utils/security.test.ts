import fs from 'node:fs';
import path from 'node:path';
import { PasswordUtils } from '@backend/shared/utils/security';

describe('PasswordUtils', () => {
  it('uses native bcrypt for password operations', () => {
    const securitySource = fs.readFileSync(
      path.resolve(__dirname, '../../../packages/shared/utils/security.ts'),
      'utf8',
    );

    expect(securitySource).toContain("from 'bcrypt'");
    expect(securitySource).not.toContain("from 'bcryptjs'");
  });

  it('verifies bcrypt-format password hashes without changing the public behavior', async () => {
    const hash = await PasswordUtils.hashPassword('StrongPass1!');

    expect(hash.startsWith('$2')).toBe(true);
    await expect(PasswordUtils.comparePassword('StrongPass1!', hash)).resolves.toBe(true);
    await expect(PasswordUtils.comparePassword('WrongPass1!', hash)).resolves.toBe(false);
  });
});
