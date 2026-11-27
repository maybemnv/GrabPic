import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-paper">
      <div className="mx-auto max-w-content px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          <div>
            <Link href="/" className="font-display text-lg italic text-ink">
              grabpic.
            </Link>
            <p className="mt-3 text-sm text-muted leading-relaxed max-w-xs">
              Event photography, personally matched. Find the photos you were part of.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Product</p>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/attendee"
                  className="text-sm text-muted hover:text-ink transition-colors"
                >
                  Find My Photos
                </Link>
              </li>
              <li>
                <Link
                  href="/organizer"
                  className="text-sm text-muted hover:text-ink transition-colors"
                >
                  For Organizers
                </Link>
              </li>
              <li>
                <Link
                  href="/status"
                  className="text-sm text-muted hover:text-ink transition-colors"
                >
                  System Status
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Project</p>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://github.com/maybemnv/GrabPic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted hover:text-ink transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted">&copy; {new Date().getFullYear()} GrabPic</p>
        </div>
      </div>
    </footer>
  )
}
