type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

// Default: debug in dev, warn in production. Override with LOG_LEVEL.
const isDev = process.env.NODE_ENV !== 'production';
const configured = process.env.LOG_LEVEL as LogLevel | undefined;
const threshold = LEVELS[configured ?? (isDev ? 'debug' : 'warn')] ?? LEVELS.info;

function enabled(level: LogLevel): boolean {
  return LEVELS[level] >= threshold;
}

export const logger = {
  debug: (...args: unknown[]) => enabled('debug') && console.debug('[debug]', ...args),
  info: (...args: unknown[]) => enabled('info') && console.info('[info]', ...args),
  warn: (...args: unknown[]) => enabled('warn') && console.warn('[warn]', ...args),
  error: (...args: unknown[]) => enabled('error') && console.error('[error]', ...args),
};
