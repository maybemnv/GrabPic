export interface BenchmarkResult {
  name: string
  target: string
  measured: number
  unit: string
  passed: boolean
  p50?: number
  p95?: number
  p99?: number
  min?: number
  max?: number
  samples: number
}

export function measureLatency(fn: () => Promise<void>, samples = 10): Promise<number[]> {
  const durations: number[] = []
  return (async () => {
    for (let i = 0; i < samples; i++) {
      const start = performance.now()
      await fn()
      durations.push(performance.now() - start)
    }
    return durations
  })()
}

export function computePercentiles(durations: number[]): { p50: number; p95: number; p99: number; min: number; max: number; mean: number } {
  const sorted = [...durations].sort((a, b) => a - b)
  const len = sorted.length

  return {
    min: sorted[0],
    max: sorted[len - 1],
    p50: sorted[Math.floor(len * 0.5)],
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)],
    mean: sorted.reduce((a, b) => a + b, 0) / len,
  }
}

export function formatBenchmark(result: BenchmarkResult): string {
  const status = result.passed ? 'PASS' : 'FAIL'
  let detail = ''

  if (result.p50 !== undefined) {
    detail = ` | p50=${result.p50?.toFixed(2)}ms p95=${result.p95?.toFixed(2)}ms p99=${result.p99?.toFixed(2)}ms`
  }

  return `[${status}] ${result.name}: ${result.measured.toFixed(2)}${result.unit} (target: ${result.target})${detail}`
}
