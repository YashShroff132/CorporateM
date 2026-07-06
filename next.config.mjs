/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Serve modern formats; Next negotiates AVIF/WebP with a fallback for
    // browsers that don't support them (Req 24.4, 24.5).
    formats: ['image/avif', 'image/webp'],
    // Allow admin-provided image URLs from any HTTPS host (S3 / R2 / Cloudinary
    // / CDN). Kept generic so operators can point mockups at any HTTPS bucket
    // without a code change; only the https scheme is permitted.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
