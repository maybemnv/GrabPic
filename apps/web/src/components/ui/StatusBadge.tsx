interface StatusBadgeProps {
  status: 'processing' | 'ready' | 'failed' | 'pending'
  label?: string
}

const STATUS_STYLES = {
  processing: 'bg-[var(--warning-bg)] text-[var(--warning)] ring-1 ring-[var(--warning)]/20',
  ready: 'bg-[var(--success-bg)] text-[var(--success)] ring-1 ring-[var(--success)]/20',
  failed: 'bg-[var(--error-bg)] text-[var(--error)] ring-1 ring-[var(--error)]/20',
  pending: 'bg-oat text-muted ring-1 ring-border',
}

const STATUS_LABELS = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
  pending: 'Pending',
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === 'processing' ? 'bg-[var(--warning)] animate-pulse' : status === 'ready' ? 'bg-[var(--success)]' : status === 'failed' ? 'bg-[var(--error)]' : 'bg-muted'}`}
      />
      {label ?? STATUS_LABELS[status]}
    </span>
  )
}
