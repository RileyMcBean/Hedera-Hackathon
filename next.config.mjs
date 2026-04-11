/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@hashgraph/sdk"],
  },
};

export default nextConfig;
