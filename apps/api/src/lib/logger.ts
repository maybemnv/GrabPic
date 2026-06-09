type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getLevel(envLevel?: string): number {
  return LEVELS[(envLevel as LogLevel) ?? 'info'] ?? LEVELS.info
}

function structuredLog(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }
  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }
}

export function createLogger(level?: string) {
  const currentLevel = getLevel(level)

  return {
    debug: (message: string, meta?: Record<string, unknown>) => {
      if (currentLevel <= LEVELS.debug) structuredLog('debug', message, meta)
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      if (currentLevel <= LEVELS.info) structuredLog('info', message, meta)
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      if (currentLevel <= LEVELS.warn) structuredLog('warn', message, meta)
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      if (currentLevel <= LEVELS.error) structuredLog('error', message, meta)
    },
  }
}
