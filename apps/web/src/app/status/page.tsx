'use client'

import { useEffect, useState } from 'react'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { FadeIn } from '@/components/ui/FadeIn'

const CHECKS = [
  { label: 'API Server', key: 'api', endpoint: '/api/health' },
  { label: 'Face Processing', key: 'processing', endpoint: '/api/health/processing' },
] as const

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

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-paper paper-texture">
        <div className="max-w-2xl mx-auto px-6 py-12 md:py-20">
          <FadeIn>
            <div className="flex items-center justify-between mb-10">
              <div>
                <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.1em] text-muted mb-2">
                  Infrastructure
                </p>
                <h1 className="font-display text-3xl text-ink tracking-tight">System Status</h1>
                <p className="text-sm text-muted mt-1">
                  {lastChecked ? `Last checked ${lastChecked.toLocaleTimeString()}` : 'Checking…'}
                </p>
              </div>
            </div>
          </FadeIn>

          <div className="space-y-3">
            {CHECKS.map(({ label, key }) => (
              <FadeIn key={key}>
                <div className="flex items-center justify-between p-4 rounded-card border border-border bg-ivory">
                  <span className="text-sm font-medium text-ink">{label}</span>
                  {health[key] === null ? (
                    <span className="text-xs text-muted animate-pulse">Checking…</span>
                  ) : (
                    <StatusBadge
                      status={health[key] ? 'ready' : 'failed'}
                      label={health[key] ? 'Operational' : 'Down'}
                    />
                  )}
                </div>
              </FadeIn>
            ))}
          </div>

          <div className="mt-6">
            <Button variant="secondary" onClick={check} className="w-full">
              Refresh
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
