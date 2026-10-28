// A build-time switch, never a credential. The old browser-only lab stays usable.
export const cloudMode = import.meta.env?.MODE === "admin-cloud"
export const serverMode = import.meta.env?.MODE === "admin-server" || cloudMode
export const storageLabel = cloudMode ? "학회 저장소" : serverMode ? "시험 서버" : "이 브라우저"
export function allowedTrialOrigin(origin: string, mode = import.meta.env?.MODE) {
  const url = new URL(origin)
  return mode === "admin-cloud"
    ? url.origin === "https://admin.pnusmp.com"
    : ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
}

// Old bookmarks move without transferring cookies, query strings or setup keys.
// API access is independently restricted to the new exact origin by the Worker.
export function legacyAdminDestination(origin: string, mode = import.meta.env?.MODE) {
  return mode === "admin-cloud" && origin === "https://smp-pdf-admin-trial.smp-website.workers.dev"
    ? "https://admin.pnusmp.com/" : null
}
