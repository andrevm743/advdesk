/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "localhost:3002", "*.vercel.app"],
    },
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
