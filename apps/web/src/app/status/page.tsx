'use client'

import { useEffect, useState } from 'react'

interface HealthStatus {
  status: string
  uptime?: number
  database?: string
  storage?: string
}

const CHECKS = [
  { label: 'API Server', key: 'api', endpoint: '/api/health' },
  { label: 'Face Processing', key: 'processing', endpoint: '/api/health/processing' },
] as const

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
        ok
          ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
          : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {ok ? 'Operational' : 'Down'}
    </span>
  )
}

export default function StatusPage() {
  const [health, setHealth] = useState<Record<string, boolean | null>>({
    api: null,
    processing: null,
  })
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  async function check() {
    for (const { key, endpoint } of CHECKS) {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
        const res = await fetch(`${base}${endpoint}`)
        setHealth((prev) => ({ ...prev, [key]: res.ok }))
      } catch {
        setHealth((prev) => ({ ...prev, [key]: false }))
      }
    }
    setLastChecked(new Date())
  }

  useEffect(() => {
    check()
    const interval = setInterval(check, 60_000)
    return () => clearInterval(interval)
  }, [])

  const allOk = Object.values(health).every((v) => v === true)
  const anyDown = Object.values(health).some((v) => v === false)

  return (
    <div className="min-h-screen bg-black text-[#E1E0CC] font-['Almarai',sans-serif]">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-['Instrument_Serif',serif] tracking-tight">
              System Status
            </h1>
            <p className="text-sm text-[#E1E0CC]/50 mt-1">
              {lastChecked
                ? `Last checked ${lastChecked.toLocaleTimeString()}`
                : 'Checking...'}
            </p>
          </div>
          {lastChecked && (
            <div className="text-right">
              {allOk && <StatusBadge ok={true} />}
              {anyDown && <StatusBadge ok={false} />}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {CHECKS.map(({ label, key }) => (
            <div
              key={key}
              className="flex items-center justify-between p-4 rounded-2xl border border-white/[0.04] bg-gradient-to-b from-[#101010] to-[#1a1a1a]"
            >
              <span className="text-sm font-medium">{label}</span>
              {health[key] === null ? (
                <span className="text-xs text-[#E1E0CC]/30 animate-pulse">Checking...</span>
              ) : (
                <StatusBadge ok={health[key] as boolean} />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={check}
          className="mt-6 w-full py-2.5 rounded-xl border border-white/[0.06] text-sm text-[#E1E0CC]/60 hover:text-[#E1E0CC] hover:border-white/[0.12] transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
