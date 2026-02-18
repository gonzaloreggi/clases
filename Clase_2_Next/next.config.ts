import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["xlsx"],
  },
};

export default nextConfig;
