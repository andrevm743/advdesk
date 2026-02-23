/** @type {import('next').NextConfig} */
const nextConfig = {
  // Firebase requires browser APIs — disable static pre-rendering
  // Pages are rendered dynamically per-request
  output: "standalone",
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
  // Suppress "punycode" deprecation warning from Firebase
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, punycode: false };
    return config;
  },
};

export default nextConfig;
