// Local generator: synthetic data only. Never reads a production env file.
import { mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import sharp from "sharp"
import { upstreamFetch } from "../../tests/cloudflare/fixture"
import { toContentItem, type NotionPage } from "../../lib/content-model"
import { renderFirstPage } from "../../lib/pdf-preview-render"
import { rebuildDocuments,searchEntry } from "../server/catalog"
import { staticEntries } from "../../lib/site-search-static"
import type { Env } from "../server/types"
import type { Statement } from "../../cloudflare/bindings"
async function main() {
const sources = { research: "33333333333343338333333333333333", notice: "22222222222242228222222222222222" }
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
const statements = ["DELETE FROM free_content;", "DELETE FROM free_jobs;", "DELETE FROM free_documents;", "DELETE FROM free_budget;"]
const pdf = await (await upstreamFetch("https://drive.usercontent.google.com/download?id=fixture-report-1")).arrayBuffer()
const png = await renderFirstPage(new Uint8Array(pdf))
const large = await sharp(png).webp({quality:94}).toBuffer({resolveWithObject:true})
const small = await sharp(png).resize({width:720}).webp({quality:82}).toBuffer()
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex")
const id = "a0000000000000000000000000000001"
await mkdir(`.smp-cache/covers/${id}`,{recursive:true})
await writeFile(`.smp-cache/covers/${id}/${hash(large.data)}.webp`,large.data)
await writeFile(`.smp-cache/covers/${id}/${hash(small)}.webp`,small)
const cover = {url:`/report-covers/${id}/${hash(small)}.webp`,previewUrl:`/report-covers/${id}/${hash(large.data)}.webp`,width:large.info.width,height:large.info.height}
const search = staticEntries.map(item=>({...item,label:item.href.startsWith('/achievements#')?'수상':'페이지'}))
for (const kind of ["research","notice"] as const) {
  let cursor: string | null = null
  const items = []
  do {
    const response = await upstreamFetch(`https://api.notion.com/v1/data_sources/${sources[kind]}/query`,{body:JSON.stringify({start_cursor:cursor})})
    const result = await response.json() as {results:NotionPage[];next_cursor:string|null}
    for(const page of result.results) {
      const item=toContentItem(page,kind)!
      const blocks=[{id:"fixture-body",type:"paragraph",paragraph:{rich_text:[{plain_text:"정적 화면과 경량 API의 무료 운영 검증 본문입니다."}]}}]
      const entry=searchEntry(item); search.push(entry)
      items.push({...item,...(kind==='research'?{cover}:{})})
      statements.push(`INSERT INTO free_content(id,kind,revision,item,search_entry,blocks,body_revision,cover) VALUES (${[item.id,kind,item.editedAt!,JSON.stringify(item),JSON.stringify(entry),JSON.stringify(blocks),item.editedAt!].map(quote).join(',')},${kind==='research'?quote(JSON.stringify(cover)):'NULL'});`)
    }
    cursor=result.next_cursor
  } while(cursor)
}
const prepare=(sql:string,params:unknown[]=[]):Statement=>({
  bind:(...values)=>prepare(sql,values),
  async run(){let i=0;statements.push(sql.replace(/\?/g,()=>{const value=params[i++];return typeof value==='number'?String(value):quote(String(value))})+';')},
  async all<T>(){return {results:[] as T[]}},async first<T>(){return null as T|null},
})
await rebuildDocuments({CMS_DB:{prepare,async batch(stmts){return Promise.all(stmts.map(stmt=>stmt.run()))}}} as Env)
statements.push(`UPDATE free_sync SET checked_at=${Date.now()},watermark=${quote(new Date().toISOString())},cursor=NULL,started_at=NULL;`)
await writeFile('.smp-cache/fixture-seed.sql',statements.join('\n'))
console.log(JSON.stringify({reports:600,notices:300,coverWidth:large.info.width,coverHeight:large.info.height,sqlStatements:statements.length}))

}
void main().catch(error=>{ console.error(error);process.exitCode=1 })
