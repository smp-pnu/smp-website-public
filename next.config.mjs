const previewFiles = [
  // Trace physical pnpm paths; including children beneath package symlinks
  // creates an invalid Vercel function bundle (symlink plus duplicate files).
  "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/*.mjs",
  "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/cmaps/**/*",
  "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/standard_fonts/**/*",
  "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/wasm/**/*",
  "./node_modules/.pnpm/@napi-rs+canvas@*/node_modules/@napi-rs/canvas/**/*",
  "./node_modules/.pnpm/@napi-rs+canvas-*/node_modules/@napi-rs/canvas-*/*",
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ] }]
  },
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/notion/webhook": previewFiles,
    "/api/cron/report-covers": previewFiles,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
