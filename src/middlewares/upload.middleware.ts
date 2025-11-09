import { Request } from 'express';
import multer from 'multer';

// Cấu hình multer để lưu file tạm thời trong memory
const storage = multer.memoryStorage();

// Giới hạn kích thước file là 5MB và chỉ cho phép file ảnh
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