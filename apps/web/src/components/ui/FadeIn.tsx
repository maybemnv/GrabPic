import { type ReactNode } from 'react'

interface FadeInProps {
  children: ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section'
}

export function FadeIn({ children, className = '', as: Tag = 'div' }: FadeInProps) {
  return <Tag className={className}>{children}</Tag>
}
