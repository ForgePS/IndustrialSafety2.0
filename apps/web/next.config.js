/** @type {import("next").NextConfig} */
module.exports = {
  basePath: process.env.BASEPATH,
  reactStrictMode: true,
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
