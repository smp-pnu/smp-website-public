import type { Database, Statement } from "../../cloudflare/bindings"
// This adapter is used only on the trusted publishing runner. Its token never
// enters the frontend or the deployed Worker.
export function remoteDatabase(account: string, database: string, token: string): Database {
  if (!/^[a-f0-9]{32}$/.test(account) || !/^[a-f0-9-]{36}$/.test(database) || !token) throw new Error("Publisher database configuration missing")
  async function query(statements: Stmt[]) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
      method:"POST",redirect:"error",signal:AbortSignal.timeout(30_000),
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({batch:statements.map(statement=>({sql:statement.sql,params:statement.params}))}),
    })
    if(!response.ok) { await response.body?.cancel();throw new Error(`Publisher database unavailable (${response.status})`) }
    const data=await response.json() as {success:boolean;result:{success:boolean;results:unknown[]}[]}
    if(!data.success || data.result.some(result=>!result.success)) throw new Error("Publisher database query failed")
    return data.result
  }
  class Stmt implements Statement {
    constructor(readonly sql:string,readonly params:unknown[]=[]) {}
    bind(...values:unknown[]) { return new Stmt(this.sql,values) }
    async all<T>() { const [result]=await query([this]);return {results:result.results as T[]} }
    async first<T>() { return (await this.all<T>()).results[0]??null }
    async run() { return (await query([this]))[0] }
  }
  return {prepare:sql=>new Stmt(sql),batch:statements=>query(statements as Stmt[])}
}
