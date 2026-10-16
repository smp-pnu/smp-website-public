import { build } from "esbuild"
import { mkdir,readFile,writeFile } from "node:fs/promises"
import path from "node:path"
import {existsSync} from "node:fs"
const root=path.resolve(import.meta.dirname,".."),out=path.join(root,"dist/free")
await build({entryPoints:["free/seo/prerender.tsx"],outfile:path.join(out,"prerender.mjs"),bundle:true,platform:"node",format:"esm",packages:"external",alias:{
  "@/data/recruitment.json":path.join(root,!process.argv.includes("--fixture")&&existsSync(path.join(root,".smp-cache/recruitment.json"))?".smp-cache/recruitment.json":"data/recruitment.json"),
  ...Object.fromEntries(["link","navigation","image","dynamic","form"].map(name=>[`next/${name}`,path.join(root,`free/client/adapters/${name}`)])),
  "@/components/sections/latest-research-section":path.join(root,"free/client/latest.tsx"),
  "@/components/research-grid":path.join(root,"free/client/grid.tsx"),
}})
const {prerender,sitemapXml,sitemapIndexXml}=await import(path.join(out,"prerender.mjs"))
const template=await readFile(path.join(out,"client/index.html"),"utf8")
for(const route of ["/","/about","/curriculum","/achievements","/recruit","/contact","/network","/alumni","/members","/search","/404"]) {
  const file=route==="/"?"index.html":`${route.slice(1)}.html`
  await writeFile(path.join(out,"client",file),prerender(template,route))
}
await writeFile(path.join(out,"client/page-shell.html"),prerender(template,"/page-shell",true))
await writeFile(path.join(out,"client/sitemap.xml"),sitemapIndexXml())
// Do not invent static-page lastmod from the deployment clock or shallow Git history.
await writeFile(path.join(out,"client/sitemap-pages.xml"),sitemapXml([],true))
await mkdir(path.join(out,"client"),{recursive:true})
await writeFile(path.join(out,"client/robots.txt"),process.argv.includes("--fixture")?"User-agent: *\nDisallow: /\n":`User-agent: *
Allow: /
Disallow: /api/
Disallow: /search
Disallow: /page-shell

Sitemap: https://pnusmp.com/sitemap.xml
`)
