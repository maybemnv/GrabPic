import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
  showArrow?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { children, variant = 'primary', loading, showArrow, className = '', disabled, ...props },
    ref,
  ) => {
    const base =
      'inline-flex items-center justify-center gap-2 font-medium text-sm transition-all rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
      primary:
        'bg-terracotta text-white px-6 py-3 hover:bg-terracotta-dark active:bg-terracotta-dark',
      secondary: 'border border-border text-ink px-6 py-3 hover:bg-oat/50 active:bg-oat',
      ghost: 'text-muted px-4 py-2 hover:text-ink hover:bg-oat/30',
    }

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
        {showArrow && !loading && <ArrowRight className="w-4 h-4" />}
      </button>
    )
  },
)
Button.displayName = 'Button'
