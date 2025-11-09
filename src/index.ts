import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from 'dotenv';
import compression from 'compression';
import { DatabaseService } from './database/connection';
import route from './routes';

const app = express();

config();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Production compression
app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

const allowedOrigins = ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:3001'];

app.use(
  cors({
    origin: function (origin, callback) {
      // Cho phép requests không có origin (như mobile apps hoặc curl requests)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('Blocked by CORS:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Middleware để xác định CORS một cách rõ ràng cho preflight requests
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Xử lý preflight requests (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  }
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Connect to database
DatabaseService.connect()
  .then(() => DatabaseService.runMigrations())
  .catch(console.error);

// Routes
route(app);

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', err);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS error: Origin not allowed',
      code: 'CORS_ERROR',
    });
  }

  return res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
// app.use('/api/*', (req: Request, res: Response) => {
//   res.status(404).json({
//     success: false,
//     message: 'API endpoint not found',
//     code: 'NOT_FOUND',
//   });
// });

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
