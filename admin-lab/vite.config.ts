import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const root = path.resolve(import.meta.dirname, "..")
const headers = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:3012 ws://localhost:3012; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
}

export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  publicDir: path.join(root, "dist/admin-lab-assets"),
  plugins: [react(), {
    name: "admin-lab-no-server-code",
    resolveId(id) {
      if (id === "server-only" || id.startsWith("node:") || /(?:free\/server|free\/jobs|app\/api)/.test(id)) {
        throw Error(`The isolated admin lab cannot import server code: ${id}`)
      }
    },
  }],
  server: { host: "127.0.0.1", port: 3012, strictPort: true, allowedHosts: ["localhost", "127.0.0.1"], headers },
  preview: { host: "127.0.0.1", port: 3012, strictPort: true, allowedHosts: ["localhost", "127.0.0.1"], headers },
  build: { outDir: path.join(root, "dist/admin-lab"), emptyOutDir: true, sourcemap: false },
})
