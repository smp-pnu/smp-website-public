import { toMember } from "../../lib/member-model"
import { normalizeId, type NotionPage } from "../../lib/content-model"
import { isNotionFileUrl } from "../../lib/pdf-source"
import { notion, source } from "./notion"
import type { Env } from "./types"
export async function memberPhoto(env:Env,id:string) {
  const page=await notion<NotionPage>(env,`pages/${id}`)
  const member=page && normalizeId(page.id)===id && toMember(page,source(env,"members"))
  if(!member || !member.image || !isNotionFileUrl(member.image)) return new Response("Not found",{status:404})
  const response=await fetch(member.image,{redirect:"manual",signal:AbortSignal.timeout(20_000)})
  if(!response.ok || !/^image\/(png|jpeg|webp|gif)$/.test(response.headers.get("content-type")??"")) {await response.body?.cancel();return new Response("Not found",{status:404})}
  let size=0
  const body=response.body?.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.byteLength;if(size>10*1024*1024) throw new Error("Image too large");controller.enqueue(chunk)}}))
  return new Response(body,{headers:{"Content-Type":response.headers.get("content-type")!,"Cache-Control":"private, no-store"}})
}
