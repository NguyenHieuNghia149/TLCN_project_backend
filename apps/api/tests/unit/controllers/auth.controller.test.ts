import { AuthController } from '@backend/api/controllers/auth.controller';

function createRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  return res;
}

describe('AuthController', () => {
  describe('getProfile', () => {
    it('returns the legacy profile payload shape and exposes a csrf bootstrap header', async () => {
      const authController = new AuthController(
        {} as any,
        {
          getProfile: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'boot@example.com',
          }),
        } as any,
        {} as any
      );
      const req: any = {
        user: { userId: 'user-1' },
        cookies: {},
      };
      const res = createRes();

      await authController.getProfile(req, res, jest.fn());

      expect(res.cookie).toHaveBeenCalledWith(
        'csrfToken',
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          path: '/',
        })
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-CSRF-Token',
        expect.any(String)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        id: 'user-1',
        email: 'boot@example.com',
      });
    });
  });
});
