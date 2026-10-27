import { DatabaseSync } from "node:sqlite"
import { readFile } from "node:fs/promises"
import type { Database, Statement } from "../cloudflare/bindings"

export function localDatabase(filename: string) {
  const sqlite=new DatabaseSync(filename)
  const prepare=(sql:string,values:unknown[]=[]):Statement=>({
    bind:(...args)=>prepare(sql,args),
    async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null},
    async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]}},
    async run(){return sqlite.prepare(sql).run(...values as never[])},
  })
  const db:Database={prepare,async batch(statements){
    sqlite.exec("BEGIN IMMEDIATE")
    try { const results=[];for(const s of statements)results.push(await s.run());sqlite.exec("COMMIT");return results }
    catch(error){sqlite.exec("ROLLBACK");throw error}
  }}
  return {sqlite,db}
}
export async function initPreview(sqlite:DatabaseSync) {
  for(const name of ["0002_free_runtime","0003_free_guards","0004_document_versions","0006_report_cover_cache","0008_publication_checks","0009_job_failures"])
    sqlite.exec(await readFile(new URL(`../cloudflare/migrations/${name}.sql`,import.meta.url),"utf8"))
  sqlite.exec(await readFile(new URL("./schema.sql",import.meta.url),"utf8"))
}
