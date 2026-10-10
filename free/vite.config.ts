import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
const root = path.resolve(import.meta.dirname, "..")
export default defineConfig({
  root: path.join(root, "free/client"), publicDir: false,
  plugins: [react(), { name: "forbid-server-in-browser", resolveId(id) { if (id === "server-only" || id.startsWith("node:")) throw new Error(`Server dependency in browser: ${id}`) } }],
  resolve: { alias: [
    ...["link", "navigation", "image", "dynamic", "form"].map(name => ({ find: `next/${name}`, replacement: path.join(root, `free/client/adapters/${name}`) })),
    { find: "@/components/research-grid", replacement: path.join(root, "free/client/grid.tsx") },
    { find: "@/components/sections/latest-research-section", replacement: path.join(root, "free/client/latest.tsx") },
    { find: "@", replacement: root },
  ] },
  build: { outDir: path.join(root, "dist/free/client"), emptyOutDir: true, sourcemap: false },
})
