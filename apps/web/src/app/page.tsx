'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import WordsPullUp from './components/WordsPullUp'
import WordsPullUpMultiStyle from './components/WordsPullUpMultiStyle'
import AnimatedLetter from './components/AnimatedLetter'

const HERO_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4'
const FEATURE_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_133058_0504132a-0cf3-4450-a370-8ea3b05c95d4.mp4'

const NAV_ITEMS = ['Our story', 'Product', 'How it works', 'Privacy', 'Contact']

const EASE = [0.16, 1, 0.3, 1] as const

function FadeUp({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <FeaturesSection />
    </>
  )
}

function HeroSection() {
  return (
    <section className="h-screen p-4 md:p-6">
      <div className="relative h-full w-full overflow-hidden rounded-2xl md:rounded-[2rem]">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>

        <div className="noise-overlay opacity-[0.7] mix-blend-overlay" />

        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

        <nav className="absolute top-0 left-1/2 z-10 -translate-x-1/2">
          <div className="bg-black rounded-b-2xl md:rounded-b-3xl px-4 py-2 md:px-8">
            <ul className="flex items-center gap-3 sm:gap-6 md:gap-12 lg:gap-14">
              {NAV_ITEMS.map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-[10px] sm:text-xs md:text-sm transition-colors"
                    style={{ color: 'rgba(225, 224, 204, 0.8)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#E1E0CC')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(225, 224, 204, 0.8)')}
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 lg:p-14">
          <div className="grid grid-cols-12 gap-4 md:gap-8">
            <div className="col-span-12 md:col-span-8">
              <WordsPullUp
                text="GrabPic"
                className="relative"
                wordClassName="text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] 2xl:text-[20vw] font-medium leading-[0.85] tracking-[-0.07em] relative"
                style={{ color: '#E1E0CC' }}
                showAsterisk
              />
            </div>

            <div className="col-span-12 md:col-span-4 flex flex-col justify-end gap-4 md:gap-6 pb-2 md:pb-4">
              <FadeUp delay={0.5}>
                <p
                  className="text-xs sm:text-sm md:text-base"
                  style={{ color: 'rgba(225, 224, 204, 0.7)', lineHeight: '1.2' }}
                >
                  Upload event photos once. Attendees take a selfie and get a personalized gallery of
                  every photo they appear in — in under 5 seconds.
                </p>
              </FadeUp>

              <FadeUp delay={0.7}>
                <button
                  className="group inline-flex items-center gap-2 bg-primary rounded-full px-5 py-2.5 sm:px-6 sm:py-3 text-black text-sm sm:text-base font-medium transition-all hover:gap-3"
                  style={{ backgroundColor: '#DEDBC8' }}
                >
                  Get Started
                  <span className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-transform group-hover:scale-110">
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: '#DEDBC8' }} />
                  </span>
                </button>
              </FadeUp>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function AboutSection() {
  return (
    <section className="bg-black px-4 py-20 md:py-32">
      <div className="mx-auto max-w-6xl bg-[#101010] rounded-2xl md:rounded-[2rem] px-6 py-12 md:px-16 md:py-20 text-center">
        <FadeUp delay={0.1}>
          <p className="text-[10px] sm:text-xs tracking-widest uppercase mb-6" style={{ color: '#DEDBC8' }}>
            Event Photography
          </p>
        </FadeUp>

        <WordsPullUpMultiStyle
          segments={[
            { text: 'Your photos.', className: 'text-primary' },
            { text: 'Matched instantly.', className: 'text-primary' },
            { text: 'No more hunting through albums.', className: 'text-gray-500' },
          ]}
          containerClassName="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl max-w-3xl mx-auto leading-[0.95] sm:leading-[0.9]"
        />

        <div className="mt-8 md:mt-12 max-w-2xl mx-auto">
          <AnimatedLetter
            text="GrabPic uses facial recognition to automatically match attendees to their photos at events. Upload hundreds of photos, and each person gets their own gallery — no more manual searching, no more shared albums. Privacy is built in: consent gate before capture, 30-day auto-expiry, and face embeddings are never shared across events."
            className="text-xs sm:text-sm md:text-base leading-relaxed"
            style={{ color: '#DEDBC8' }}
          />
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  const features = [
    {
      title: 'Bulk Upload.',
      number: '01',
      icon: 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171918_4a5edc79-d78f-4637-ac8b-53c43c220606.png&w=1280&q=85',
      items: [
        'Upload hundreds of photos at once',
        'Direct upload to edge storage via signed URLs',
        'Async processing, zero server bottlenecks',
      ],
      video: false,
    },
    {
      title: 'Smart Processing.',
      number: '02',
      icon: 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171741_ed9845ab-f5b2-4018-8ce7-07cc01823522.png&w=1280&q=85',
      items: [
        'Face detection via MTCNN on GPU',
        'ArcFace 512-dim embedding generation',
        'DBSCAN clustering for face grouping',
      ],
      video: false,
    },
    {
      title: 'Instant Matching.',
      number: '03',
      icon: 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171809_f56666dc-c099-4778-ad82-9ad4f209567b.png&w=1280&q=85',
      items: [
        'Take a selfie, get your gallery in <5s',
        'Vector similarity search at the edge',
        'No account needed, just a passcode',
      ],
      video: false,
    },
  ]

  return (
    <section className="relative min-h-screen bg-black px-4 py-20 md:py-32 overflow-hidden">
      <div className="bg-noise absolute inset-0 opacity-[0.15] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <WordsPullUpMultiStyle
          segments={[
            { text: 'Studio-grade workflows for visionary creators.', className: 'text-primary' },
            {
              text: 'Built for pure vision. Powered by art.',
              className: 'text-gray-500',
            },
          ]}
          containerClassName="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal mb-16 text-center"
        />

        <div
          ref={ref}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-2 md:gap-1 lg:h-[480px]"
        >
          <FeatureCard
            index={0}
            isInView={isInView}
            className="lg:col-span-2 lg:row-span-2 relative overflow-hidden rounded-2xl"
          >
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            >
              <source src={FEATURE_VIDEO} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6">
              <p className="text-sm md:text-base font-medium" style={{ color: '#E1E0CC' }}>
                Your creative canvas.
              </p>
            </div>
          </FeatureCard>

          {features.map((feature, i) => (
            <FeatureCard key={feature.number} index={i + 1} isInView={isInView} className="rounded-2xl">
              <div
                className="flex flex-col h-full p-4 md:p-5 rounded-2xl"
                style={{ backgroundColor: '#212121' }}
              >
                <img
                  src={feature.icon}
                  alt=""
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded object-cover mb-4"
                />
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm sm:text-base font-medium" style={{ color: '#E1E0CC' }}>
                    {feature.title}
                  </h3>
                  <span className="text-xs sm:text-sm text-gray-500">{feature.number}</span>
                </div>

                <ul className="space-y-2 mb-auto">
                  {feature.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#DEDBC8' }} />
                      <span className="text-xs sm:text-sm text-gray-400">{item}</span>
                    </li>
                  ))}
                </ul>

                <button className="group inline-flex items-center gap-1.5 mt-4 text-xs sm:text-sm font-medium transition-colors hover:gap-2.5 self-start">
                  <span style={{ color: '#DEDBC8' }}>Learn more</span>
                  <ArrowRight className="w-3.5 h-3.5 -rotate-45 transition-transform group-hover:translate-x-0.5" style={{ color: '#DEDBC8' }} />
                </button>
              </div>
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  children,
  index,
  isInView,
  className = '',
}: {
  children: React.ReactNode
  index: number
  isInView: boolean
  className?: string
}) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={isInView ? { scale: 1, opacity: 1 } : {}}
      transition={{ duration: 0.5, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
