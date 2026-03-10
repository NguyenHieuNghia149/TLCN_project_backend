import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const isDev = process.env.NODE_ENV !== 'production';

const LOG_DIR = process.env.LOG_DIR || path.resolve(process.cwd(), 'logs');

const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isDev ? devFormat : prodFormat,
  }),
];

// File transports only in environments where LOG_DIR is writable
if (!isDev || process.env.LOG_TO_FILE === 'true') {
  // Combined log: all levels
  transports.push(
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '14d',
      level: 'info',
      format: prodFormat,
    })
  );

  // Error log: errors only
  transports.push(
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '14d',
      level: 'error',
      format: prodFormat,
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transports,
  exitOnError: false,
});

export default logger;
