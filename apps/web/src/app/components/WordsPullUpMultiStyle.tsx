'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

interface Segment {
  text: string
  className?: string
}

interface WordsPullUpMultiStyleProps {
  segments: Segment[]
  containerClassName?: string
}

export default function WordsPullUpMultiStyle({ segments, containerClassName = '' }: WordsPullUpMultiStyleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })

  const allWords: { word: string; className: string }[] = []
  for (const seg of segments) {
    const words = seg.text.split(' ')
    for (const word of words) {
      allWords.push({ word, className: seg.className ?? '' })
    }
  }

  return (
    <div ref={ref} className={`inline-flex flex-wrap justify-center ${containerClassName}`}>
      {allWords.map((item, i) => (
        <motion.span
          key={i}
          initial={{ y: 20, opacity: 0 }}
          animate={isInView ? { y: 0, opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className={item.className}
        >
          {item.word}
          {i < allWords.length - 1 ? '\u00A0' : ''}
        </motion.span>
      ))}
    </div>
  )
}
