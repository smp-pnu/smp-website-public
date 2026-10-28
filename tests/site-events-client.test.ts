import {test} from 'node:test'
import assert from 'node:assert/strict'
import {observePdf,observeDownloads} from '../lib/site-events'

test('browser measurement is optional, counts one final PDF result, and emits no identity or PDF URL',async()=>{
 const keys=['window','location','navigator','document','fetch'] as const
 const previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 const doc=Object.assign(new EventTarget(),{visibilityState:'hidden'}),sent:unknown[]=[]
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()})
  Object.defineProperty(globalThis,'location',{configurable:true,value:{hostname:'pnusmp.com'}})
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{doNotTrack:'0',webdriver:false}})
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc})
  Object.defineProperty(globalThis,'fetch',{configurable:true,value:async(_url:string,init:RequestInit)=>{sent.push(JSON.parse(String(init.body)));assert.equal(init.credentials,'omit');return new Response(null,{status:204})}})
  const finish=observePdf('/api/content/research/'+'a'.repeat(32)+'/pdf?private-url-is-not-logged=1')
  finish('ready');finish('failed');finish('ready')
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(sent.length,1)
  const events=(sent[0] as {events:{kind:string}[]}).events
  assert.deepEqual(events.map(e=>e.kind),['start','ready'])
  assert.ok(!JSON.stringify(sent).includes('private-url'))
  Object.defineProperty(globalThis,'location',{configurable:true,value:{hostname:'admin.pnusmp.com'}})
  observePdf('/api/content/research/'+'a'.repeat(32)+'/pdf')('ready');observeDownloads()();doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(sent.length,1)
  Object.defineProperty(globalThis,'location',{configurable:true,value:{hostname:'pnusmp.com'}})
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{doNotTrack:'1',webdriver:false}})
  observePdf('/api/content/research/'+'a'.repeat(32)+'/pdf')('failed');doc.dispatchEvent(new Event('visibilitychange'));assert.equal(sent.length,1)
 }finally{for(const key of keys){const p=previous.get(key);if(p)Object.defineProperty(globalThis,key,p);else Reflect.deleteProperty(globalThis,key)}}
})
