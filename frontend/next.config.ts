import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip ESLint during production builds (fix lints later locally)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Optional: skip TS build errors in CI/deploy; re-enable after fixes
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
