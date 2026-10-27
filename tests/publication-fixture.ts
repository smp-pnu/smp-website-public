import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import sharp from "sharp"
import { localDatabase } from "../admin-publisher/local-database"
import { createHandler, type Env } from "../admin-cloud/worker"
import { authenticator, cookieJar } from "./admin-passkey-fixture.mjs"
import { fileIdentity, chunkBytes, sha256 } from "../admin-cloud/protocol"
import { emptyFields, type Draft } from "../admin-lab/model"
import { samplePdf } from "../admin-lab/sample"
import { HttpReportSource } from "../admin-publisher/source"
import { MockDrive } from "./admin-drive-fixture"
export async function publicationFixture() {
  const local=localDatabase(":memory:")
  local.sqlite.exec(await readFile(new URL("../admin-cloud/schema.sql",import.meta.url),"utf8"))
  local.sqlite.exec(await readFile(new URL("../admin-cloud/history-budget.sql",import.meta.url),"utf8"))
  const origin="https://admin.pnusmp.com",key="e".repeat(64),setup="b".repeat(64),jar=cookieJar(),device=authenticator(),google=new MockDrive()
  let now=Date.now(),csrf=""
  const env:Env={ADMIN_DB:local.db,ORIGIN:origin,ASSETS:{fetch:async()=>new Response("fixture")},SESSION_SIGNING_KEY:"a".repeat(64),SETUP_TOKEN_HASH:await sha256(new TextEncoder().encode(setup)),REPORT_EXPORT_KEY:key,DRIVE_ACCOUNT_EMAIL:google.email,AUTH_LIMITER:{async limit(){return {success:true}}}}
  const handler=createHandler(()=>now,google.fetch)
  const request:typeof fetch=async(input,init)=>handler(new Request(input,init),env)
  const call=async(path:string,method="GET",data?:unknown)=>{
    const binary=data instanceof Uint8Array
    const response=await request(origin+path,{method,headers:{Origin:origin,Cookie:jar.read(),"CF-Connecting-IP":"192.0.2.1","X-CSRF-Token":csrf,...(data?{"Content-Type":binary?"application/octet-stream":"application/json"}:{})},body:data?(binary?data as Uint8Array<ArrayBuffer>:JSON.stringify(data)):undefined,redirect:"manual"})
    jar.set(response)
    assert.ok(response.status<400,`${path}: ${response.status} ${response.status>=400?await response.text():""}`)
    return response
  }
  const options=await (await call("/api/auth/register/options","POST",{mode:"setup",token:setup})).json()
  csrf=(await (await call("/api/auth/register/verify","POST",{response:device.register(options,origin)})).json()).session.csrf
  const login=async()=>{
    const options=await (await call("/api/auth/login/options","POST",{})).json()
    csrf=(await (await call("/api/auth/login/verify","POST",{response:device.authenticate(options,origin)})).json()).session.csrf
  }
  const connectDrive=async()=>{
    await call("/api/storage/drive/configure","POST",{web:{client_id:"123-test.apps.googleusercontent.com",client_secret:"local-test-secret-only",redirect_uris:[origin+"/api/storage/drive/callback"]}})
    const {url}=await (await call("/api/storage/drive/start","POST")).json()
    await call(`/api/storage/drive/callback?code=test&state=${new URL(url).searchParams.get("state")}`)
    await call("/api/storage/drive/confirm","POST")
  }
  const upload=async(index=0,replacement?:Draft)=>{
    const file=samplePdf(index),pdf=new Uint8Array(await file.arrayBuffer()),cover=new Uint8Array(await sharp({create:{width:50,height:70,channels:3,background:"white"}}).webp().toBuffer())
    const fields={...emptyFields(),title:index===0?"[게시 시험] HPSP 성장 보고서":"[게시 시험] 인바디 분석",company:index===0?"HPSP":"인바디",ticker:index===0?"403870":"041830",date:"2026-10-20",semester:"2026-2",author:"리서치 1팀",notRated:true}
    const input={filename:file.name,fileBytes:pdf.length,hash:await fileIdentity(pdf),rawSha256:await sha256(pdf),coverBytes:cover.length,pages:3,fields,evidence:[],warnings:[],...(replacement?{replace:{id:replacement.id,revision:replacement.revision}}:{})}
    const begin=await (await call("/api/uploads","POST",input)).json()
    assert.ok(begin.id)
    for(const [kind,bytes] of [["pdf",pdf],["cover",cover]] as const)for(let offset=0;offset<bytes.length;offset+=chunkBytes)
      await call(`/api/uploads/${begin.id}/${kind}/${offset/chunkBytes}`,"PUT",bytes.slice(offset,offset+chunkBytes))
    const draft=await (await call(`/api/uploads/${begin.id}/finish`,"POST")).json() as Draft
    const ids:string[]=env.REPORT_EXPORT_SCOPE?JSON.parse(env.REPORT_EXPORT_SCOPE).ids.filter((id:string)=>id!=='0'.repeat(32)):[]
    env.REPORT_EXPORT_SCOPE=JSON.stringify({ids:[...new Set([...ids,draft.id.replaceAll('-','')])],expires:now+86400000})
    return {draft,pdf}
  }
  env.REPORT_EXPORT_SCOPE=JSON.stringify({ids:['0'.repeat(32)],expires:now+86400000})
  const change=async(d:Draft,command:unknown)=>{now++;await call(`/api/drafts/${d.id}`,"PATCH",{revision:d.revision,command});return JSON.parse((local.sqlite.prepare("SELECT data FROM objects WHERE id=?").get(d.id) as {data:string}).data) as Draft}
  return {...local,env,request,call,upload,change,login,connectDrive,google,source:()=>new HttpReportSource(origin,key,request),tick:(ms:number)=>{now+=ms},now:()=>now}
}
