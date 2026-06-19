/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phase 0: keep the foundation build deterministic. Linting is wired in a later
  // hardening pass so a missing/strict lint rule never blocks the foundation build.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // exceljs (server-only XLSX parser) is CommonJS with Node deps; keep it external
  // so it runs from node_modules rather than being bundled into server chunks.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
