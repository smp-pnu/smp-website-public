// A build-time switch, never a credential. The old browser-only lab stays usable.
export const cloudMode = import.meta.env?.MODE === "admin-cloud"
export const serverMode = import.meta.env?.MODE === "admin-server" || cloudMode
export const storageLabel = serverMode ? "시험 서버" : "이 브라우저"
export function allowedTrialOrigin(origin: string, mode = import.meta.env?.MODE) {
  const url = new URL(origin)
  return mode === "admin-cloud"
    ? url.origin === "https://smp-pdf-admin-trial.smp-website.workers.dev"
    : ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
}
