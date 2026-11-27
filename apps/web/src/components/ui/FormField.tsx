import { type InputHTMLAttributes, forwardRef, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id: externalId, ...props }, ref) => {
    const generatedId = useId()
    const id = externalId ?? generatedId

    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          className={`w-full rounded-input border border-border bg-ivory px-4 py-3 text-sm text-ink placeholder:text-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta ${error ? 'border-[var(--error)] focus:ring-[var(--error)]/40' : ''} ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...props}
        />
        {hint && !error && (
          <p id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="text-xs text-[var(--error)]" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'
