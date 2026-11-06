import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // TypeScript errors must fail the build (previously suppressed — P1.4 fix).
  reactStrictMode: false,
};

export default nextConfig;
