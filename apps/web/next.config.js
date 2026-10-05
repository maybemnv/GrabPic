// The API URL is inlined at build time; a missing value would silently ship a
// site that calls localhost, so fail the production build instead.
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL must be set to build the web app')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['@grabpic/types'],
}

module.exports = nextConfig
