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

  it('readJWTConfigFromEnv throws when the access secret is missing', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
    });

    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => jwtModule.readJWTConfigFromEnv()).toThrow(
      'JWT_ACCESS_SECRET must be provided in environment variables',
    );
  });

  it('readJWTConfigFromEnv returns access-token-only config and ignores refresh env values', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'leftover-refresh-secret',
      JWT_ACCESS_EXPIRES_IN: undefined,
      JWT_REFRESH_EXPIRES_IN: '30d',
    });

    expect(jwtModule.readJWTConfigFromEnv()).toEqual({
      accessSecret: 'access-secret',
      accessExpiresIn: '15m',
    });
  });

  it('JWTUtils reads environment lazily when generating and verifying access tokens', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: 'leftover-refresh-secret',
    });

    process.env.JWT_ACCESS_SECRET = 'lazy-access-secret';

    const accessToken = jwtModule.JWTUtils.generateAccessToken(
      'user-1',
      'lazy@example.com',
      'teacher',
    );

    const accessPayload = jwtModule.JWTUtils.verifyAccessToken(accessToken);

    expect(accessPayload).toMatchObject({
      userId: 'user-1',
      email: 'lazy@example.com',
      role: 'teacher',
      type: 'access',
    });
  });

  it('generates only access tokens through jsonwebtoken.sign', () => {
    let jwtModule!: JwtModule;
    let signSpy!: jest.SpyInstance;
    applyEnv({});

    jest.isolateModules(() => {
      const isolatedJwt = require('jsonwebtoken');
      signSpy = jest.spyOn(isolatedJwt, 'sign');
      jwtModule = require('@backend/shared/utils/jwt');
    });

    const helper = jwtModule.createJWTUtils({
      accessSecret: 'access-only-secret',
      accessExpiresIn: '15m',
    });

    const accessToken = helper.generateAccessToken('user-2', 'explicit@example.com', 'admin');
    const accessPayload = helper.verifyAccessToken(accessToken);

    expect(signSpy).toHaveBeenCalledTimes(1);
    expect(accessPayload).toMatchObject({
      userId: 'user-2',
      email: 'explicit@example.com',
      role: 'admin',
      type: 'access',
    });
    expect(helper.decodeToken(accessToken)).toMatchObject({ type: 'access' });
    expect(helper.isTokenExpired(accessToken)).toBe(false);
    expect(helper.getTokenExpiration(accessToken)).toBeInstanceOf(Date);
  });

  it('maps expired and invalid access token errors to stable public messages', () => {
    const jwtModule = loadJwtModule();
    const helper = jwtModule.createJWTUtils({
      accessSecret: 'map-access-secret',
      accessExpiresIn: '15m',
    });

    const expiredAccessToken = jwt.sign(
      { userId: 'user-3', email: 'expired@example.com', role: 'user', type: 'access' },
      'map-access-secret',
      { expiresIn: -1 },
    );

    expect(() => helper.verifyAccessToken(expiredAccessToken)).toThrow('Access token has expired');
    expect(() => helper.verifyAccessToken('not-a-token')).toThrow('Invalid access token');
  });

  it('does not expose refresh-token or token-pair JWT helpers', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: 'legacy-access-secret',
      JWT_REFRESH_SECRET: 'legacy-refresh-secret',
    });

    expect((jwtModule.JWTUtils as any).generateTokenPair).toBeUndefined();
    expect((jwtModule.JWTUtils as any).generateRefreshToken).toBeUndefined();
    expect((jwtModule.JWTUtils as any).verifyRefreshToken).toBeUndefined();
    expect((jwtModule as any).generateTokens).toBeUndefined();
    expect((jwtModule as any).verifyRefreshToken).toBeUndefined();
  });

  it('legacy verifyAccessToken export continues to delegate to JWTUtils', () => {
    const jwtModule = loadJwtModule({
      JWT_ACCESS_SECRET: 'legacy-access-secret',
      JWT_REFRESH_SECRET: 'leftover-refresh-secret',
    });
    const accessPayload = {
      userId: 'user-4',
      email: 'legacy@example.com',
      role: 'owner',
      type: 'access',
    } as any;

    const accessSpy = jest.spyOn(jwtModule.JWTUtils, 'verifyAccessToken').mockReturnValue(accessPayload);

    expect(jwtModule.verifyAccessToken('access-token')).toBe(accessPayload);
    expect(accessSpy).toHaveBeenCalledWith('access-token');
  });
});
