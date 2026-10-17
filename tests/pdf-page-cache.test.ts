import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PdfPageCache, type PdfPreparation } from '../lib/pdf-page-cache'

const tick = () => new Promise<void>(resolve => setImmediate(resolve))
async function until(test: () => boolean) {
  for (let i = 0; i < 100; i++) { if (test()) return; await tick() }
  assert.ok(test(), 'preparation did not settle')
}
function fixture(total = 27, maxBytes = 10_000) {
  const rendered: number[] = [], released: number[] = []
  let state: PdfPreparation = { entries: [], complete: false, limited: false, failed: [] }
  const cache = new PdfPageCache({ total, maxBytes,
    render: async page => { rendered.push(page); return { page, url: `blob:${page}`, bytes: 100, ratio: 1.4 } },
    release: entry => released.push(entry.page), changed: next => { state = next }, yield: tick,
  })
  return { cache, rendered, released, state: () => state }
}

test('prepares three pages first, then every page once; arbitrary ready-page turns do not render again', async () => {
  const f = fixture()
  f.cache.request(1)
  await until(() => f.state().entries.length === 3)
  await tick()
  assert.deepEqual(f.rendered, [1, 2, 3])
  f.cache.prepareRest()
  await until(() => f.state().complete)
  assert.deepEqual(f.rendered, Array.from({ length: 27 }, (_, i) => i + 1))
  for (const page of [27, 15, 3, 1, 20]) f.cache.request(page)
  await tick()
  assert.equal(f.rendered.length, 27)
  f.cache.dispose()
  assert.equal(f.released.length, 27)
})

test('foreground jumps take priority and hidden tabs pause the queue', async () => {
  const f = fixture()
  f.cache.pause(true); f.cache.request(15); f.cache.prepareRest()
  await tick()
  assert.equal(f.rendered.length, 0)
  f.cache.pause(false)
  await until(() => f.state().entries.length >= 1)
  f.cache.request(27)
  await until(() => f.state().entries.some(entry => entry.page === 27))
  assert.deepEqual(f.rendered.slice(0, 2), [15, 27])
  f.cache.pause(true)
  const count = f.rendered.length
  await tick(); await tick()
  assert.equal(f.rendered.length, count)
  f.cache.dispose()
})

test('memory budget stops background preparation without stranding a requested page', async () => {
  const f = fixture(27, 350)
  f.cache.request(1); f.cache.show(1); f.cache.prepareRest()
  await until(() => f.state().limited)
  assert.equal(f.state().complete, false)
  assert.equal(f.state().entries.length, 3)
  assert.ok(f.released.includes(4))
  f.cache.request(27)
  await until(() => f.state().entries.some(entry => entry.page === 27))
  assert.ok(f.state().entries.some(entry => entry.page === 1), 'visible page stays until replacement is ready')
  assert.ok(f.state().entries.reduce((sum, entry) => sum + entry.bytes, 0) <= 350)
  f.cache.dispose()
})

test('late work after disposal releases its URL and cannot update the viewer', async () => {
  let finish!: (value: { page: number; url: string; bytes: number; ratio: number }) => void
  const released: string[] = [], changed: PdfPreparation[] = []
  const cache = new PdfPageCache({ total: 1, maxBytes: 1000,
    render: () => new Promise(resolve => { finish = resolve }),
    release: entry => released.push(entry.url), changed: value => changed.push(value), yield: tick,
  })
  cache.request(1); cache.dispose()
  finish({ page: 1, url: 'blob:late', bytes: 100, ratio: 1.4 })
  await tick()
  assert.deepEqual(released, ['blob:late'])
  assert.equal(changed.length, 0)
})

test('one failed page does not block other pages or claim full readiness', async () => {
  let state: PdfPreparation | undefined
  const cache = new PdfPageCache({ total: 5, maxBytes: 1000,
    render: async page => { if (page === 2) throw new Error('bad page'); return { page, url: `blob:${page}`, bytes: 100, ratio: 1.4 } },
    release: () => {}, changed: next => { state = next }, yield: tick,
  })
  cache.request(1); cache.prepareRest()
  await until(() => state?.entries.length === 4)
  assert.deepEqual(state?.failed, [2])
  assert.equal(state?.complete, false)
  cache.dispose()
})

test('very long PDFs stop speculative rendering at the page cap and remain readable', async () => {
  const f = fixture(140, 50_000)
  f.cache.request(1); f.cache.prepareRest()
  // The queue yields once per render; give this larger case enough turns.
  for (let i = 0; i < 150 && !f.state().limited; i++) await tick()
  assert.equal(f.state().entries.length, 120)
  assert.equal(f.state().limited, true)
  f.cache.show(1); f.cache.request(140)
  await until(() => f.state().entries.some(entry => entry.page === 140))
  assert.equal(f.state().entries.length, 120)
  f.cache.dispose()
})

test('a foreground jump cancels a slow speculative page without marking it as broken',async()=>{
 let state:PdfPreparation|undefined,started=false,cancelled=false
 const cache=new PdfPageCache({total:5,maxBytes:10000,release:()=>{},changed:s=>{state=s},yield:tick,
  render:async(page,signal)=>{
   if(page===2 && !cancelled){started=true;await new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{cancelled=true;reject(Error('cancelled'))},{once:true}))}
   return {page,url:`blob:${page}`,bytes:100,ratio:1.4}
  }})
 cache.request(1)
 await until(()=>started)
 cache.request(5)
 await until(()=>!!state?.entries.some(v=>v.page===5))
 assert.equal(cancelled,true);assert.deepEqual(state?.failed,[])
 cache.prepareRest();await until(()=>!!state?.complete);cache.dispose()
})
