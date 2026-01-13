/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    //ignore type errors
    ignoreBuildErrors: true,
  },
  eslint: {
    // ignore elist errors
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

