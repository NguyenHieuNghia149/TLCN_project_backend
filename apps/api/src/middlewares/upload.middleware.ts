import { Request } from 'express';
import multer from 'multer';

// Configure multer to store files temporarily in memory
const storage = multer.memoryStorage();

// Limit file size to 5MB and only allow image files
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (!file.mimetype.startsWith('image/')) {
    cb(new Error('Only image files are allowed!'));
    return;
  }
  cb(null, true);
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: fileFilter,
});
