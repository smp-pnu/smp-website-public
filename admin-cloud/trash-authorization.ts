import type { Database } from '../cloudflare/bindings'
import {HttpError,object} from '../admin-server/validation'
import {StepUp,sessionBinding} from './step-up'
import {randomToken} from './session'
import {sha256} from './protocol'
export async function trashPurpose(items:{id:string;revision:number}[]) {
 return `trash:purge:${await sha256(new TextEncoder().encode(JSON.stringify(items.map(v=>[v.id,v.revision]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))))}`
}
export class TrashAuthorization {
 constructor(readonly db:Database,readonly now:number){}
 private async epoch(){return (await this.db.prepare("SELECT value FROM admin_config WHERE key='recovery'").first<{value:string}>())?.value??''}
 async create(request:Request,input:unknown) {
  const data=object(input),items=data.items
  if(!Array.isArray(items)||!items.length||items.length>100)throw new HttpError(400,'삭제할 자료를 다시 확인해 주세요.')
  const normalized=items.map(v=>{const item=object(v);if(typeof item.id!=='string'||!/^[a-f0-9]{32}$/.test(item.id)||!Number.isSafeInteger(item.revision)||Number(item.revision)<1)throw new HttpError(400,'삭제 대상을 확인해 주세요.');return {id:item.id,revision:Number(item.revision)}})
  if(new Set(normalized.map(v=>v.id)).size!==normalized.length)throw new HttpError(400,'삭제 대상이 중복됐어요.')
  const epoch=await this.epoch()
  await new StepUp(this.db,this.now).consume(request,data.stepUpToken,epoch,await trashPurpose(normalized))
  const token=randomToken(),remaining=Object.fromEntries(normalized.map(v=>[v.id,v.revision]))
  await this.db.batch([
   this.db.prepare('DELETE FROM admin_purge_batches WHERE expires<=?').bind(this.now),
   this.db.prepare('INSERT INTO admin_purge_batches(hash,session,epoch,remaining,expires) VALUES(?,?,?,?,?)').bind(await sha256(new TextEncoder().encode(token)),await sessionBinding(request),epoch,JSON.stringify(remaining),this.now+300000)
  ])
  return {token}
 }
 async consume(request:Request,input:unknown) {
  const value=object(input)
  if(typeof value.token!=='string'||!/^[a-f0-9]{64}$/.test(value.token)||typeof value.id!=='string'||!/^[a-f0-9]{32}$/.test(value.id)||!Number.isSafeInteger(value.revision))throw new HttpError(403,'영구 삭제 전에 패스키로 본인 확인을 해주세요.')
  const row=await this.db.prepare(`UPDATE admin_purge_batches SET remaining=json_remove(remaining,?)
    WHERE hash=? AND session=? AND epoch=? AND expires>? AND json_extract(remaining,?)=? RETURNING hash`)
    .bind(`$."${value.id}"`,await sha256(new TextEncoder().encode(value.token)),await sessionBinding(request),await this.epoch(),this.now,`$."${value.id}"`,value.revision).first()
  if(!row)throw new HttpError(403,'삭제 승인이 만료됐거나 대상이 바뀌었어요. 다시 확인해 주세요.')
 }
}
