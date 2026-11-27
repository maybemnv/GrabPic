'use client'

import Link from 'next/link'
import { Shield, Clock, Lock } from 'lucide-react'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { FadeIn } from '@/components/ui/FadeIn'

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <PrivacySection />
        <CTASection />
      </main>
      <SiteFooter />
    </>
  )
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-paper paper-texture">
      <div className="mx-auto max-w-content px-6 py-20 md:py-28 lg:py-36">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          <div className="lg:col-span-6 xl:col-span-5">
            <FadeIn>
              <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.1em] text-muted mb-6">
                An Event Photo Archive
              </p>
            </FadeIn>

            <FadeIn delay={0.06}>
              <h1 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.05] tracking-tight text-ink">
                Somewhere in these photos, <em className="text-terracotta">there&rsquo;s you.</em>
              </h1>
            </FadeIn>

            <FadeIn delay={0.12}>
              <p className="mt-6 text-base md:text-lg text-muted leading-relaxed max-w-lg">
                Find the moments you were part of. Event organizers share their photographs, and
                GrabPic helps you discover yours with a consented selfie.
              </p>
            </FadeIn>

            <FadeIn delay={0.18}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/attendee"
                  className="rounded-input bg-terracotta px-6 py-3 text-sm font-medium text-white hover:bg-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Find My Photos
                </Link>
                <Link
                  href="/organizer"
                  className="rounded-input border border-border px-6 py-3 text-sm font-medium text-ink hover:bg-oat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  For Organizers
                </Link>
              </div>
            </FadeIn>
          </div>

          <div className="lg:col-span-6 xl:col-span-7 relative">
            <div className="border-y border-border py-10 space-y-6">
              <p className="font-display text-3xl text-ink">One event. Your photos.</p>
              <p className="text-muted leading-relaxed">
                Have an event code? Enter it, give your consent, and take a selfie to look for
                matching photos.
              </p>
              <p className="text-sm text-muted">
                Organizing? Upload your collection and share the event link with attendees.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-border/60" />
    </section>
  )
}

function HowItWorksSection() {
  const steps = [
    {
      number: '01',
      title: 'Share the event photos',
      desc: 'Create an event and upload photos directly. Each photo is securely stored and processed for face detection.',
    },
    {
      number: '02',
      title: 'Take a consented selfie',
      desc: 'Attendees enter the event code, consent to biometric processing, and snap a quick selfie.',
    },
    {
      number: '03',
      title: 'Find your moments',
      desc: 'We look for matches among the processed event photos. Matching photos appear in your personal gallery. Results depend on photo quality and may miss some appearances.',
    },
  ]

  return (
    <section className="bg-paper paper-texture">
      <div className="mx-auto max-w-content px-6 py-20 md:py-28">
        <FadeIn>
          <div className="max-w-2xl">
            <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.1em] text-muted mb-4">
              01 — How It Works
            </p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-ink leading-[1.1] tracking-tight">
              Three steps to your photos
            </h2>
          </div>
        </FadeIn>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 0.08}>
              <div className="relative">
                <span className="font-display text-6xl md:text-7xl text-oat/80 leading-none">
                  {step.number}
                </span>
                <h3 className="mt-3 text-xl font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{step.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

function PrivacySection() {
  const items = [
    {
      icon: <Shield className="w-5 h-5" />,
      title: 'Consent before capture',
      desc: 'Selfie capture is blocked until the user explicitly consents to facial recognition processing.',
    },
    {
      icon: <Lock className="w-5 h-5" />,
      title: 'Event-scoped matching',
      desc: 'Your selfie is compared only with photos from the event you joined.',
    },
    {
      icon: <Clock className="w-5 h-5" />,
      title: 'Automatic data expiry',
      desc: 'Event photos and face data have a 30-day retention period.',
    },
  ]

  return (
    <section className="bg-espresso text-white">
      <div className="mx-auto max-w-content px-6 py-20 md:py-28">
        <FadeIn>
          <div className="max-w-2xl">
            <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.1em] text-oat/70 mb-4">
              02 — Privacy & Trust
            </p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-ivory leading-[1.1] tracking-tight">
              Biometric data protection, built in
            </h2>
            <p className="mt-4 text-base text-oat/80 leading-relaxed">
              GrabPic processes biometric data with care. Consent and event-specific matching guide
              how your photos are handled.
            </p>
          </div>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <FadeIn key={item.title} delay={i * 0.08}>
              <div className="rounded-card border border-white/10 bg-white/5 p-6">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-4 text-oat">
                  {item.icon}
                </div>
                <h3 className="text-lg font-semibold text-ivory mb-2">{item.title}</h3>
                <p className="text-sm text-oat/70 leading-relaxed">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTASection() {
  return (
    <section className="bg-paper paper-texture border-t border-border/60">
      <div className="mx-auto max-w-content px-6 py-20 md:py-28">
        <div className="max-w-2xl mx-auto text-center">
          <FadeIn>
            <p className="font-display text-3xl italic text-ink mb-4">grabpic.</p>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-ink leading-[1.1] tracking-tight">
              Your event photos, <em className="text-terracotta">found.</em>
            </h2>
            <p className="mt-4 text-base text-muted leading-relaxed">
              Whether you&rsquo;re organizing an event or finding your photos, GrabPic makes the
              experience personal.
            </p>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/attendee"
                className="rounded-input border border-border px-6 py-3 text-sm font-medium text-ink hover:bg-oat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Find My Photos
              </Link>
              <Link
                href="/organizer"
                className="rounded-input border border-border px-6 py-3 text-sm font-medium text-ink hover:bg-oat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Create an Event
              </Link>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  )
}
