import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

type Logger = winston.Logger;

type LoggerConfig = {
  isDev: boolean;
  logDir: string;
  logToFile: boolean;
  logLevel: string;
};

const buildWinstonLogger = winston['createLogger'].bind(winston);
const RotateFileTransport = DailyRotateFile as unknown as new (
  options: Record<string, unknown>,
) => winston.transport;

let loggerInstance: Logger | null = null;

/** Resolves logger config from the current process environment. */
function readLoggerConfig(): LoggerConfig {
  const isDev = process.env.NODE_ENV !== 'production';

  return {
    isDev,
    logDir: process.env.LOG_DIR || path.resolve(process.cwd(), 'logs'),
    logToFile: !isDev || process.env.LOG_TO_FILE === 'true',
    logLevel: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  };
}

/** Builds the colored formatter used in development. */
function createDevFormat() {
  return winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    }),
  );
}

/** Builds the structured formatter used outside development. */
function createProdFormat() {
  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  );
}

/** Builds the logger transport list from resolved config. */
function createTransports(config: LoggerConfig): winston.transport[] {
  const devFormat = createDevFormat();
  const prodFormat = createProdFormat();
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: config.isDev ? devFormat : prodFormat,
    }),
  ];

  if (config.logToFile) {
    transports.push(
      new RotateFileTransport({
        dirname: config.logDir,
        filename: 'application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxFiles: '14d',
        level: 'info',
        format: prodFormat,
      }),
    );

    transports.push(
      new RotateFileTransport({
        dirname: config.logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxFiles: '14d',
        level: 'error',
        format: prodFormat,
      }),
    );
  }

  return transports;
}

/** Creates a fresh logger instance with the current environment-driven config. */
export function createLogger(): Logger {
  const config = readLoggerConfig();

  return buildWinstonLogger({
    level: config.logLevel,
    transports: createTransports(config),
    exitOnError: false,
  });
}

/** Returns the shared logger singleton, creating it on first access. */
export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }

  return loggerInstance;
}

export const logger: Logger = getLogger();

export default logger;
