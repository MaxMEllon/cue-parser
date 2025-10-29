/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  basePath: process.env.NODE_ENV === 'production' ? '/cue-parser' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/cue-parser' : '',
}

module.exports = nextConfig