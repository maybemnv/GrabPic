'use client'

import { useRef, type CSSProperties } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

interface AnimatedLetterProps {
  text: string
  className?: string
  style?: CSSProperties
}

export default function AnimatedLetter({ text, className = '', style }: AnimatedLetterProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.8', 'end 0.2'],
  })

  const chars = text.split('')

  return (
    <p ref={ref} className={className} style={style}>
      {chars.map((char, i) => {
        const charProgress = i / chars.length
        const opacity = useTransform(
          scrollYProgress,
          [Math.max(0, charProgress - 0.1), Math.min(1, charProgress + 0.05)],
          [0.2, 1],
        )
        return (
          <motion.span key={i} style={{ opacity }}>
            {char}
          </motion.span>
        )
      })}
    </p>
  )
}
