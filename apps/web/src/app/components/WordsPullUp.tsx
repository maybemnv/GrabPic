'use client'

import { useRef, type CSSProperties } from 'react'
import { motion, useInView } from 'framer-motion'

interface WordsPullUpProps {
  text: string
  className?: string
  wordClassName?: string
  showAsterisk?: boolean
  style?: CSSProperties
}

export default function WordsPullUp({ text, className = '', wordClassName = '', showAsterisk, style }: WordsPullUpProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  const words = text.split(' ')

  return (
    <div ref={ref} className={`inline-flex flex-wrap ${className}`} style={style}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ y: 20, opacity: 0 }}
          animate={isInView ? { y: 0, opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className={`relative ${wordClassName}`}
        >
          {word}
          {i === words.length - 1 && showAsterisk && (
            <sup className="absolute top-[0.65em] -right-[0.3em] text-[0.31em]">*</sup>
          )}
          {i < words.length - 1 ? '\u00A0' : ''}
        </motion.span>
      ))}
    </div>
  )
}
