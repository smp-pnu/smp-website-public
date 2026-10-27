import { startAuthentication } from "@simplewebauthn/browser"
import { api } from "./server-storage"
export async function reauthenticate(purpose: string): Promise<string> {
  const post = async (path: string, value: unknown) => (await api(path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
  })).json()
  const optionsJSON = await post("/auth/reauth/options", { purpose })
  const response = await startAuthentication({ optionsJSON })
  return (await post("/auth/reauth/verify", { response })).stepUpToken
}
