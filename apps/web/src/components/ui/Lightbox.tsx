'use client'

import { type ReactNode, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'

interface LightboxProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  onPrev?: () => void
  onNext?: () => void
}

export function Lightbox({ open, onClose, children, onPrev, onNext }: LightboxProps) {
  const backdropRef = useRef<HTMLDialogElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && onPrev) onPrev()
      if (e.key === 'ArrowRight' && onNext) onNext()
    },
    [onClose, onPrev, onNext],
  )

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    const dialog = backdropRef.current
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = ''
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <dialog
      ref={backdropRef}
      className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none items-center justify-center bg-espresso/90 p-0 backdrop:bg-transparent open:flex"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
      aria-modal="true"
      aria-label="Photo viewer"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {onPrev && (
        <button
          onClick={onPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Previous photo"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {onNext && (
        <button
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Next photo"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      <div className="max-w-[90vw] max-h-[90vh]">{children}</div>
    </dialog>
  )
}
