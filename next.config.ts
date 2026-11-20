import type { NextConfig } from "next";

/**
 * Static export: every page (including all 304 tool pages) is prerendered to
 * HTML at build time and deployed to Cloudflare Pages from the `out/` directory.
 * Server-side features live in Cloudflare Pages Functions (`functions/`).
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
