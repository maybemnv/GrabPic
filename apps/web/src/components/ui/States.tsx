import { AlertCircle, FileQuestion, Loader2 } from 'lucide-react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-oat/60 flex items-center justify-center mb-4">
        {icon ?? <FileQuestion className="w-5 h-5 text-muted" />}
      </div>
      <h3 className="text-lg font-medium text-ink mb-1">{title}</h3>
      {description && <p className="text-sm text-muted max-w-sm">{description}</p>}
      {action && (
        <Button variant="secondary" className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message: string
  retry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, retry }: ErrorStateProps) {
  return (
    <div className="rounded-card border border-[var(--error)]/20 bg-[var(--error-bg)] p-4">
      <div className="flex gap-3">
        <AlertCircle className="w-5 h-5 text-[var(--error)] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[var(--error)]">{title}</p>
          <p className="text-sm text-[var(--error)]/80 mt-0.5">{message}</p>
          {retry && (
            <button
              onClick={retry}
              className="text-sm font-medium text-[var(--error)] underline underline-offset-2 mt-2 hover:no-underline"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3" role="status">
      <Loader2 className="w-6 h-6 text-terracotta animate-spin" />
      <p className="text-sm text-muted">{message}</p>
      <span className="sr-only">{message}</span>
    </div>
  )
}
