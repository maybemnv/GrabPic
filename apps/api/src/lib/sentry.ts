export function createSentryReporter(dsn: string | undefined) {
  if (!dsn) {
    return {
      captureException: (_err: unknown, _meta?: Record<string, unknown>) => {},
      captureMessage: (_msg: string, _meta?: Record<string, unknown>) => {},
    }
  }

  async function send(body: Record<string, unknown>) {
    try {
      await fetch(dsn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      // Silently fail — don't let Sentry itself cause errors
    }
  }

  return {
    captureException: (err: unknown, meta?: Record<string, unknown>) => {
      const error =
        err instanceof Error
          ? { message: err.message, name: err.name, stack: err.stack }
          : { message: String(err) }

      send({
        event_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        exception: { values: [error] },
        extra: meta,
        level: 'error',
      })
    },

    captureMessage: (msg: string, meta?: Record<string, unknown>) => {
      send({
        event_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        message: { formatted: msg },
        extra: meta,
        level: 'info',
      })
    },
  }
}
