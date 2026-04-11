import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@hashgraph/sdk"],
  },
};

export default nextConfig;
