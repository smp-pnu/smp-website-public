import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "node:path";

export default defineConfig({
  plugins: [
    vinext({
      cache: { data: { adapter: path.resolve(import.meta.dirname, "cloudflare/data-cache.ts") } },
    }),
    cloudflare({
      ...(process.env.SMP_CF_FIXTURE === "1" ? { config: {
        name: "smp-fixture-preview",
        main: "tests/cloudflare/worker.ts",
        vars: { SMP_RUNTIME: "cloudflare", SMP_CF_FIXTURE: "1" },
      } } : {}),
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@/lib/content-tasks": path.resolve(import.meta.dirname, "cloudflare/content-tasks.ts"),
      ...(process.env.SMP_CF_FIXTURE === "1" ? {
        "@/lib/upstream-fetch": path.resolve(import.meta.dirname, "tests/cloudflare/fixture.ts"),
      } : {}),
    },
  },
});
