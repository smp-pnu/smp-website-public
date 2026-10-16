import type {Env} from './types'
import {parsePdfContentRange} from '../../lib/pdf-range'

export type ReaderCache=Pick<Cache,'match'|'put'>
const fills=new Map<string,Promise<void>>()
type Asset={url:string;bytes:number}

// ASSETS.fetch may ignore Range. The native Cache API slices complete cached
// bodies without buffering or slicing large PDF bytes in JavaScript.
export async function readReaderAsset(request:Request,asset:Asset,env:Env,cache?:ReaderCache):Promise<Response|undefined> {
  const range=request.headers.get('range'),url=new URL(request.url)
  const key=new Request(new URL(`/api/cache/reader-pdf${asset.url}`,url))
  const query=new Request(key,{headers:range?{Range:range}:{}})
  async function hit(){
    const value=await cache?.match(query)
    if(!value)return
    const size=value.status===206?parsePdfContentRange(value.headers.get('content-range'))?.total:Number(value.headers.get('content-length'))
    if(value.status===416 || (value.headers.get('content-type')==='application/pdf' && size===asset.bytes && [200,206].includes(value.status)))return value
    await value.body?.cancel()
  }
  async function source(){
    const response=await env.ASSETS.fetch(new Request(new URL(asset.url,url),{signal:AbortSignal.timeout(15000)}))
    const length=response.headers.get('content-length')
    if(response.status!==200 || !response.body || response.headers.get('content-type')?.split(';')[0]!=='application/pdf' || (length!==null && Number(length)!==asset.bytes)){await response.body?.cancel();return}
    if(length===null){
      const Native=(globalThis as unknown as {FixedLengthStream?:new(length:number)=>{readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>}}).FixedLengthStream
      if(!Native)return
      const stream=new Native(asset.bytes),headers=new Headers(response.headers)
      headers.set('Content-Length',String(asset.bytes))
      void response.body.pipeTo(stream.writable).catch(()=>{})
      return new Response(stream.readable,{headers})
    }
    return response
  }
  if(cache)try{
    const cached=await hit();if(cached)return cached
    let pending=fills.get(key.url)
    if(!pending && fills.size<2){
      pending=(async()=>{
        const response=await source();if(!response)return
        const headers=new Headers({'Content-Type':'application/pdf','Content-Length':String(asset.bytes),'Cache-Control':'public, max-age=300','Accept-Ranges':'bytes'})
        // No response.clone(): exactly one native stream fills a cached copy.
        await cache.put(key,new Response(response.body,{headers}))
      })().finally(()=>fills.delete(key.url))
      fills.set(key.url,pending)
    }
    if(pending){await pending;const cached=await hit();if(cached)return cached}
  }catch{/* A cache outage must not make the verified document unreadable. */}
  try{
    const response=await source();if(!response)return
    // HTTP permits ignoring Range and sending a full 200 response. Do not
    // advertise range support when the cache cannot provide it, or PDF.js
    // starts redundant whole-file downloads while asking for small ranges.
    const headers=new Headers(response.headers);headers.set('Accept-Ranges','none')
    return new Response(response.body,{headers})
  }catch{return}
}
