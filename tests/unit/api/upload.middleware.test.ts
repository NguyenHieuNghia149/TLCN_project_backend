import express, { ErrorRequestHandler, RequestHandler } from 'express';
import request from 'supertest';

import { upload } from '@backend/api/middlewares/upload.middleware';

function createUploadApp() {
  const app = express();

  const respondWithUploadedFile: RequestHandler = (req, res) => {
    res.status(200).json({
      mimetype: req.file?.mimetype,
      size: req.file?.size,
    });
  };

  const handleUploadError: ErrorRequestHandler = (error, req, res, next) => {
    if (!error) {
      next();
      return;
    }

    res.status(400).json({
      message: error instanceof Error ? error.message : String(error),
    });
  };

  app.post('/avatar', upload.single('avatar'), respondWithUploadedFile);
  app.use(handleUploadError);

  return app;
}

describe('upload middleware', () => {
  it('stores image uploads in memory', async () => {
    const app = createUploadApp();

    const response = await request(app)
      .post('/avatar')
      .attach('avatar', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      mimetype: 'image/png',
      size: 4,
    });
  });

  it('rejects non-image uploads', async () => {
    const app = createUploadApp();

    const response = await request(app)
      .post('/avatar')
      .attach('avatar', Buffer.from('not an image'), {
        filename: 'avatar.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Only image files are allowed!',
    });
  });
});
