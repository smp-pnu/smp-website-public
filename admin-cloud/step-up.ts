import { HttpError } from "../admin-server/validation"
import type { Database } from "../cloudflare/bindings"
import { cookie, cookieName, randomToken } from "./session"
import { sha256 } from "./protocol"

const digest = (value: string) => sha256(new TextEncoder().encode(value))
export const sessionBinding = (request: Request) => digest(cookie(request, cookieName))
export function securityPurpose(value: unknown) {
  if (typeof value !== "string" || !(value === "key:add" || value === "drive:rotate" || /^key:remove:[A-Za-z0-9_-]{1,1024}$/.test(value)))
    throw new HttpError(400, "본인 확인 작업을 다시 선택해 주세요.")
  return value
}
export class StepUp {
  constructor(readonly db: Database, readonly now: number) {}
  async grant(request: Request, epoch: string, purpose: string) {
    const token = randomToken()
    await this.db.batch([
      this.db.prepare("DELETE FROM admin_stepups WHERE expires<=?").bind(this.now),
      this.db.prepare("INSERT INTO admin_stepups(hash,session,epoch,purpose,expires) VALUES(?,?,?,?,?)")
        .bind(await digest(token), await sessionBinding(request), epoch, purpose, this.now + 120_000),
    ])
    return token
  }
  async consume(request: Request, token: unknown, epoch: string, purpose: string) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(403, "기존 패스키로 본인 확인을 먼저 해주세요.")
    const row = await this.db.prepare("DELETE FROM admin_stepups WHERE hash=? AND session=? AND epoch=? AND purpose=? AND expires>? RETURNING hash")
      .bind(await digest(token), await sessionBinding(request), epoch, purpose, this.now).first()
    if (!row) throw new HttpError(403, "본인 확인이 만료됐거나 이미 사용됐어요. 다시 확인해 주세요.")
  }
}
