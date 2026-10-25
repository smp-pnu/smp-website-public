import path from "node:path"
import { mergeConfig } from "vite"
import base from "../admin-lab/vite.config"
export default mergeConfig(base, { mode: "admin-cloud", build: { outDir: path.resolve(import.meta.dirname, "../dist/admin-cloud/assets") } })
