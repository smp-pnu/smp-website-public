import path from "node:path"
import { mergeConfig } from "vite"
import base from "../admin-lab/vite.config"
export default mergeConfig(base, { mode: "admin-cloud", build: {
  outDir: path.resolve(import.meta.dirname, "../dist/admin-cloud/assets"),
  // The admin loads its PDF analyzer and notice editor with the screen.
  // Tabs left open across a deployment must not request deleted hashed chunks.
  rolldownOptions: { output: { codeSplitting: false } },
  chunkSizeWarningLimit: 1520, // scripts/admin-cloud.mjs also enforces raw/gzip budgets.
} })
