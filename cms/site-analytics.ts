import type {Database} from '../cloudflare/bindings'
import type {SiteSnapshot} from '../admin-lab/site-model'
export async function readSiteAnalytics(db:Database):Promise<SiteSnapshot|null> {
  const row=await db.prepare('SELECT payload FROM cms_site_snapshot WHERE id=1').first<{payload:string|null}>()
  return row?.payload?JSON.parse(row.payload):null
}
