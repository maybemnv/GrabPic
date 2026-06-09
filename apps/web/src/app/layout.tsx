import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PostHogProvider } from '../components/PostHogProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'GrabPic — Event Photos, Instantly Matched',
  description:
    'Upload event photos once. Attendees take a selfie and get their personalized gallery in under 5 seconds.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-black">
        <Suspense>
          <PostHogProvider>{children}</PostHogProvider>
        </Suspense>
      </body>
    </html>
  )
}
