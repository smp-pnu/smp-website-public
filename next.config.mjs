const previewFiles = [
  "./node_modules/pdfjs-dist/legacy/build/*.mjs", "./node_modules/pdfjs-dist/cmaps/**/*",
  "./node_modules/pdfjs-dist/standard_fonts/**/*", "./node_modules/pdfjs-dist/wasm/**/*",
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/.pnpm/@napi-rs+canvas-*/node_modules/@napi-rs/canvas-*/*",
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/content/research/*/cover": previewFiles,
    "/api/notion/webhook": previewFiles,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
