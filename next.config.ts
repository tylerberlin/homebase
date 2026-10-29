import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone, so TrueNAS only needs a plain Node image.
  // (Vercel, which hosts the backup copy, builds its own way.)
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["ws"],
  // No next/image in use; keep the platform-specific sharp binaries out of the bundle.
  images: { unoptimized: true },
  outputFileTracingExcludes: { "*": ["**/@img/**", "**/sharp/**", "**/*.tgz", "deploy/**", "data/**"] },
  poweredByHeader: false,
  // Standard browser protections: no framing (clickjacking), no MIME sniffing, no full URLs leaked
  // to other sites, and https-only for the public address once a browser has seen it.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "dash.example.com" }],
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }],
      },
    ];
  },
};

export default nextConfig;
