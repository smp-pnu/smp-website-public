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
test('legacy cache migration preserves generated sharing artwork and only its bounded manifest',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smp-share-cache-')),key=randomBytes(32).toString('hex'),source=join(root,'source'),cache=join(root,'cache.enc')
 const names=[`covers/_share/${'a'.repeat(32)}/v2-${'b'.repeat(64)}-${'c'.repeat(16)}.jpg`,`covers/_share/${'a'.repeat(32)}/v1-${'b'.repeat(64)}.png`,'covers/_share/manifest.json']
 try{
  for(const name of names){await mkdir(join(source,name,'..'),{recursive:true});await writeFile(join(source,name),Buffer.from(name))}
  assert.equal((await sealCache(source,cache,key)).files,names.length)
  assert.equal((await openCache(cache,join(root,'restored'),key)).files,names.length)
  for(const name of names)assert.deepEqual(await readFile(join(root,'restored',name)),Buffer.from(name))
  for(const name of ['covers/_share/secrets.json',`covers/_share/${'a'.repeat(32)}/arbitrary.jpg`]){
   await writeFile(join(source,name),'unexpected');await assert.rejects(sealCache(source,cache,key),/Unexpected cache asset path/);await rm(join(source,name))
  }
  await writeFile(join(source,'covers/_share/manifest.json'),Buffer.alloc(1024**2+1))
  await assert.rejects(sealCache(source,cache,key),/size budget/)
 }finally{await rm(root,{recursive:true,force:true})}
})
