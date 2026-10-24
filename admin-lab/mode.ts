// A build-time switch, never a credential. The old browser-only lab stays usable.
export const serverMode = import.meta.env.MODE === "admin-server"
export const storageLabel = serverMode ? "시험 서버" : "이 브라우저"
