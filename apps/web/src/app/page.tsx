'use client'

import { useRef, useState, useEffect } from 'react'
import { motion, useInView, useScroll, useMotionValueEvent } from 'framer-motion'
import { ArrowRight, Check, Menu, X } from 'lucide-react'
import WordsPullUp from './components/WordsPullUp'
import WordsPullUpMultiStyle from './components/WordsPullUpMultiStyle'
import AnimatedLetter from './components/AnimatedLetter'

const HERO_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4'
const FEATURE_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260406_133058_0504132a-0cf3-4450-a370-8ea3b05c95d4.mp4'

const EASE = [0.16, 1, 0.3, 1] as const

const NAV_ITEMS = [
  { label: 'Our story', href: '#story' },
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'Contact', href: '#contact' },
]

function CTAButton({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      className={`group inline-flex items-center gap-2 rounded-full px-5 py-2.5 sm:px-6 sm:py-3 text-black text-sm sm:text-base font-medium transition-all hover:gap-3 ${className}`}
      style={{ backgroundColor: '#DEDBC8' }}
    >
      {children}
      <span className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-transform group-hover:scale-110">
        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: '#DEDBC8' }} />
      </span>
    </button>
  )
}

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
  const [mobileOpen, setMobileOpen] = useState(false)
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 50)
  })

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => {
      document.documentElement.style.scrollBehavior = ''
    }
  }, [])

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? 'bg-black/90 backdrop-blur-md shadow-lg' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3 md:py-4">
          <a
            href="#hero"
            className="text-sm md:text-base font-bold tracking-wide"
            style={{ color: '#E1E0CC' }}
          >
            GrabPic
          </a>

          <ul className="hidden md:flex items-center gap-8 lg:gap-12">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-xs lg:text-sm transition-colors duration-300"
                  style={{ color: 'rgba(225, 224, 204, 0.8)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#E1E0CC')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = 'rgba(225, 224, 204, 0.8)')
                  }
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <button
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ color: '#E1E0CC' }}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden border-t border-white/10 bg-black/95 backdrop-blur-md"
          >
            <ul className="flex flex-col px-4 py-4 gap-4">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block text-sm transition-colors"
                    style={{ color: 'rgba(225, 224, 204, 0.8)' }}
                    onClick={() => setMobileOpen(false)}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#E1E0CC')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = 'rgba(225, 224, 204, 0.8)')
                    }
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </motion.nav>

      <main>
        <HeroSection />
        <AboutSection />
        <FeaturesSection />
        <HowItWorksSection />
        <PrivacySection />
        <FooterSection />
      </main>
    </>
  )
}

function HeroSection() {
  return (
    <section id="hero" className="h-screen p-4 md:p-6 pt-16 md:pt-20">
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
                  Upload event photos once. Attendees take a selfie and get a personalized gallery
                  of every photo they appear in — in under 5 seconds.
                </p>
              </FadeUp>

              <FadeUp delay={0.7}>
                <CTAButton>Get Started</CTAButton>
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
    <section id="story" className="bg-black px-4 py-20 md:py-32">
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

        <FadeUp delay={0.3} className="mt-10">
          <CTAButton>Explore the platform</CTAButton>
        </FadeUp>
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
    },
    {
      title: 'Instant Matching.',
      number: '03',
      icon: 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260405_171809_f56666dc-c099-4778-ad82-9ad4f209567b.png&w=1280&q=85',
      items: [
        'Take a selfie, get your gallery in under 5s',
        'Vector similarity search at the edge',
        'No account needed, just a passcode',
      ],
    },
  ]

  return (
    <section id="product" className="relative min-h-screen bg-black px-4 py-20 md:py-32 overflow-hidden">
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
            className="lg:col-span-2 lg:row-span-2 relative overflow-hidden rounded-2xl group cursor-pointer"
          >
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            >
              <source src={FEATURE_VIDEO} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 flex items-center gap-3">
              <p className="text-sm md:text-base font-medium" style={{ color: '#E1E0CC' }}>
                Your creative canvas.
              </p>
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5 transition-transform group-hover:translate-x-1" style={{ color: '#E1E0CC' }} />
            </div>
          </FeatureCard>

          {features.map((feature, i) => (
            <FeatureCard
              key={feature.number}
              index={i + 1}
              isInView={isInView}
              className="rounded-2xl group cursor-pointer"
            >
              <div
                className="flex flex-col h-full p-4 md:p-5 rounded-2xl transition-colors duration-300"
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

                <button className="group/btn inline-flex items-center gap-1.5 mt-4 text-xs sm:text-sm font-medium transition-all hover:gap-2.5 self-start">
                  <span style={{ color: '#DEDBC8' }}>Learn more</span>
                  <ArrowRight
                    className="w-3.5 h-3.5 -rotate-45 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5"
                    style={{ color: '#DEDBC8' }}
                  />
                </button>
              </div>
            </FeatureCard>
          ))}
        </div>

        <FadeUp delay={0.3} className="mt-16 text-center">
          <CTAButton>Start creating</CTAButton>
        </FadeUp>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  const steps = [
    { number: '01', title: 'Create an Event', desc: 'Organizers set up an event in seconds. A unique 6-digit passcode and share link are generated instantly.' },
    { number: '02', title: 'Upload Photos', desc: 'Bulk upload hundreds of photos directly to edge storage via signed URLs. No server bottlenecks.' },
    { number: '03', title: 'Take a Selfie', desc: 'Attendees enter the passcode, consent to biometric processing, and snap a selfie.' },
    { number: '04', title: 'Get Matched', desc: 'Vector similarity search finds every photo they appear in. Gallery delivered in under 5 seconds.' },
  ]

  return (
    <section id="how-it-works" className="relative bg-black px-4 py-20 md:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <FadeUp delay={0.1}>
          <p className="text-[10px] sm:text-xs tracking-widest uppercase mb-4 text-center" style={{ color: '#DEDBC8' }}>
            How It Works
          </p>
        </FadeUp>

        <WordsPullUp
          text="From upload to match in four steps."
          className="justify-center mb-16"
          wordClassName="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-medium text-primary"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {steps.map((step, i) => (
            <FadeUp key={step.number} delay={i * 0.15}>
              <div className="bg-[#101010] rounded-2xl p-5 md:p-6 h-full flex flex-col">
                <span className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-600 mb-3">
                  {step.number}
                </span>
                <h3 className="text-sm sm:text-base font-medium mb-2" style={{ color: '#E1E0CC' }}>
                  {step.title}
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

function PrivacySection() {
  return (
    <section id="privacy" className="bg-black px-4 py-20 md:py-32">
      <div className="mx-auto max-w-6xl text-center">
        <FadeUp delay={0.1}>
          <p className="text-[10px] sm:text-xs tracking-widest uppercase mb-4" style={{ color: '#DEDBC8' }}>
            Privacy First
          </p>
        </FadeUp>

        <WordsPullUp
          text="Biometric data protection built into every layer."
          className="justify-center"
          wordClassName="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-medium text-primary"
        />

        <FadeUp delay={0.3} className="mt-8 max-w-2xl mx-auto">
          <p className="text-xs sm:text-sm md:text-base leading-relaxed text-gray-400">
            Consent gate before selfie capture. 30-day auto-expiry on all event data. Face
            embeddings are scoped to a single event and never shared. Right to deletion with a
            single click.
          </p>
        </FadeUp>
      </div>
    </section>
  )
}

function FooterSection() {
  return (
    <footer id="contact" className="bg-black border-t border-white/10 px-4 py-12 md:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          <div>
            <p className="text-base md:text-lg font-bold mb-3" style={{ color: '#E1E0CC' }}>
              GrabPic
            </p>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed max-w-xs">
              Facial recognition-powered event photo distribution. Your photos, matched instantly.
            </p>
          </div>

          <div>
            <p className="text-xs sm:text-sm font-medium mb-3" style={{ color: '#E1E0CC' }}>
              Product
            </p>
            <ul className="space-y-2">
              {['Our story', 'Features', 'Pricing', 'FAQ'].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-xs sm:text-sm text-gray-500 hover:text-primary transition-colors duration-300"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs sm:text-sm font-medium mb-3" style={{ color: '#E1E0CC' }}>
              Contact
            </p>
            <ul className="space-y-2">
              {['hello@grabpic.app', 'Twitter', 'GitHub'].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-xs sm:text-sm text-gray-500 hover:text-primary transition-colors duration-300"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] sm:text-xs text-gray-600">
            &copy; {new Date().getFullYear()} GrabPic. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((item) => (
              <a
                key={item}
                href="#"
                className="text-[10px] sm:text-xs text-gray-600 hover:text-primary transition-colors duration-300"
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
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
