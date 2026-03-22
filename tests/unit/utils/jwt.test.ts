import jwt from 'jsonwebtoken';

const originalEnv = { ...process.env };

type JwtModule = typeof import('@backend/shared/utils/jwt');

function applyEnv(overrides: Record<string, string | undefined>): void {
  process.env = { ...originalEnv };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function loadJwtModule(overrides: Record<string, string | undefined> = {}): JwtModule {
  let jwtModule!: JwtModule;
  applyEnv(overrides);

  jest.isolateModules(() => {
    jwtModule = require('@backend/shared/utils/jwt');
  });

  return jwtModule;
}

describe('jwt utils', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    applyEnv({});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not throw on module import when JWT secrets are missing', () => {
    applyEnv({
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
      JWT_ACCESS_EXPIRES_IN: undefined,
      JWT_REFRESH_EXPIRES_IN: undefined,
    });

    expect(() => {
      jest.isolateModules(() => {
        require('@backend/shared/utils/jwt');
      });
    }).not.toThrow();
  });

  it('readJWTConfigFromEnv throws when required secrets are missing', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
    });

    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => jwtModule.readJWTConfigFromEnv()).toThrow(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be provided in environment variables',
    );
  });

  it('readJWTConfigFromEnv returns the default expiration values', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      JWT_ACCESS_EXPIRES_IN: undefined,
      JWT_REFRESH_EXPIRES_IN: undefined,
    });

    expect(jwtModule.readJWTConfigFromEnv()).toEqual({
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    });
  });

  it('JWTUtils reads environment lazily when methods are called', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
    });

    process.env.JWT_ACCESS_SECRET = 'lazy-access-secret';
    process.env.JWT_REFRESH_SECRET = 'lazy-refresh-secret';

    const tokenPair = jwtModule.JWTUtils.generateTokenPair(
      'user-1',
      'lazy@example.com',
      'teacher',
    );

    const accessPayload = jwtModule.JWTUtils.verifyAccessToken(tokenPair.accessToken);
    const refreshPayload = jwtModule.JWTUtils.verifyRefreshToken(tokenPair.refreshToken);

    expect(accessPayload).toMatchObject({
      userId: 'user-1',
      email: 'lazy@example.com',
      role: 'teacher',
      type: 'access',
    });
    expect(refreshPayload).toMatchObject({
      userId: 'user-1',
      email: 'lazy@example.com',
      role: 'teacher',
      type: 'refresh',
    });
    expect(tokenPair.expiresIn).toBeGreaterThan(0);
  });

  it('createJWTUtils preserves token-pair semantics with explicit config', () => {
    const jwtModule = loadJwtModule();
    const helper = jwtModule.createJWTUtils({
      accessSecret: 'explicit-access-secret',
      refreshSecret: 'explicit-refresh-secret',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    });

    const tokenPair = helper.generateTokenPair('user-2', 'explicit@example.com', 'admin');
    const accessPayload = helper.verifyAccessToken(tokenPair.accessToken);
    const refreshPayload = helper.verifyRefreshToken(tokenPair.refreshToken);

    expect(accessPayload).toMatchObject({
      userId: 'user-2',
      email: 'explicit@example.com',
      role: 'admin',
      type: 'access',
    });
    expect(refreshPayload).toMatchObject({
      userId: 'user-2',
      email: 'explicit@example.com',
      role: 'admin',
      type: 'refresh',
    });
    expect(refreshPayload.nonce).toEqual(expect.any(String));
    expect(helper.decodeToken(tokenPair.accessToken)).toMatchObject({ type: 'access' });
    expect(helper.isTokenExpired(tokenPair.accessToken)).toBe(false);
    expect(helper.getTokenExpiration(tokenPair.accessToken)).toBeInstanceOf(Date);
  });

  it('maps expired and invalid token errors to the stable public messages', () => {
    const jwtModule = loadJwtModule();
    const helper = jwtModule.createJWTUtils({
      accessSecret: 'map-access-secret',
      refreshSecret: 'map-refresh-secret',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    });

    const expiredAccessToken = jwt.sign(
      { userId: 'user-3', email: 'expired@example.com', role: 'user', type: 'access' },
      'map-access-secret',
      { expiresIn: -1 },
    );
    const expiredRefreshToken = jwt.sign(
      {
        userId: 'user-3',
        email: 'expired@example.com',
        role: 'user',
        type: 'refresh',
        nonce: 'nonce-1',
      },
      'map-refresh-secret',
      { expiresIn: -1 },
    );

    expect(() => helper.verifyAccessToken(expiredAccessToken)).toThrow('Access token has expired');
    expect(() => helper.verifyAccessToken('not-a-token')).toThrow('Invalid access token');
    expect(() => helper.verifyRefreshToken(expiredRefreshToken)).toThrow('Refresh token has expired');
    expect(() => helper.verifyRefreshToken('not-a-token')).toThrow('Invalid refresh token');
  });

  it('legacy helper exports continue to delegate to JWTUtils', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: 'legacy-access-secret',
      JWT_REFRESH_SECRET: 'legacy-refresh-secret',
    });
    const tokenPair = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 1234,
    };
    const accessPayload = {
      userId: 'user-4',
      email: 'legacy@example.com',
      role: 'owner',
      type: 'access',
    } as any;
    const refreshPayload = {
      userId: 'user-4',
      email: 'legacy@example.com',
      role: 'owner',
      type: 'refresh',
    } as any;

    const generateSpy = jest.spyOn(jwtModule.JWTUtils, 'generateTokenPair').mockReturnValue(tokenPair);
    const accessSpy = jest.spyOn(jwtModule.JWTUtils, 'verifyAccessToken').mockReturnValue(accessPayload);
    const refreshSpy = jest.spyOn(jwtModule.JWTUtils, 'verifyRefreshToken').mockReturnValue(refreshPayload);

    expect(jwtModule.generateTokens('user-4', 'legacy@example.com', 'owner')).toBe(tokenPair);
    expect(jwtModule.verifyAccessToken('access-token')).toBe(accessPayload);
    expect(jwtModule.verifyRefreshToken('refresh-token')).toBe(refreshPayload);
    expect(generateSpy).toHaveBeenCalledWith('user-4', 'legacy@example.com', 'owner');
    expect(accessSpy).toHaveBeenCalledWith('access-token');
    expect(refreshSpy).toHaveBeenCalledWith('refresh-token');
  });
});