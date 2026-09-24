/** @type {import("next").NextConfig} */
module.exports = {
  basePath: process.env.BASEPATH,
  reactStrictMode: true,
  // TypeScript runs as a separate CI gate; legacy lint findings are tracked separately.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@repo/ui'],
  images: {
    remotePatterns: [
      ...(process.env.NEXT_PUBLIC_APP_DOMAIN ? [{
        protocol: process.env.NODE_ENV === 'development' ? 'http' : 'https',
        hostname: process.env.NEXT_PUBLIC_APP_DOMAIN
      }] : []),
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com'
      }
    ]
  }
}
