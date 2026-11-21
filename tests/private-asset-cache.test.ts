import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomBytes} from 'node:crypto'
// @ts-ignore trusted Node-only build helper
import {sealCache,openCache} from '../scripts/private-asset-cache.mjs'
test('private asset cache restores exact bytes and rejects tampering and wrong keys before extraction',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smp-private-cache-')),key=randomBytes(32).toString('hex'),name=`covers/${'a'.repeat(32)}/${'b'.repeat(64)}.webp`
 try{
  await mkdir(join(root,'source',name,'..'),{recursive:true});const content=randomBytes(1024*1024+17);await writeFile(join(root,'source',name),content)
  const cache=join(root,'cache.enc');assert.equal((await sealCache(join(root,'source'),cache,key)).files,1)
  const sealed=await readFile(cache);assert.ok(!sealed.includes(Buffer.from(name)));assert.ok(!sealed.includes(content.subarray(0,32)))
  await openCache(cache,join(root,'restored'),key);assert.deepEqual(await readFile(join(root,'restored',name)),content)
  await assert.rejects(openCache(cache,join(root,'wrong'),randomBytes(32).toString('hex')))
  sealed[sealed.length-30]^=1;await writeFile(cache,sealed);await assert.rejects(openCache(cache,join(root,'tampered'),key))
  assert.ok(!(await readdir(root)).includes('tampered'));assert.ok(!(await readdir(root)).some(n=>n.endsWith('.verified')))
  await symlink('/etc/passwd',join(root,'source',`covers/${'a'.repeat(32)}/${'c'.repeat(64)}.webp`));await assert.rejects(sealCache(join(root,'source'),cache,key))
 }finally{await rm(root,{recursive:true,force:true})}
})
