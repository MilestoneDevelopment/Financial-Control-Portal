/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phase 0: keep the foundation build deterministic. Linting is wired in a later
  // hardening pass so a missing/strict lint rule never blocks the foundation build.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
