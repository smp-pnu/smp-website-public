import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,stat,readFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {stageReaderAssets} from '../scripts/stage-reader-assets.mjs'

const id='a0000000000000000000000000000001',other='b0000000000000000000000000000002',name='a'.repeat(64)+'.pack'
test('deployment staging reuses immutable file storage and survives cache cleanup',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'smp-stage-'))
 try {
  for(const owner of [id,other]){await mkdir(path.join(root,'cache',owner),{recursive:true});await writeFile(path.join(root,'cache',owner,name),'unchanged bytes')}
  await writeFile(path.join(root,'cache',id,'unrelated.txt'),'do not deploy')
  await stageReaderAssets(path.join(root,'cache'),path.join(root,'output'),true)
  const source=path.join(root,'cache',id,name),staged=path.join(root,'output',id,name)
  assert.equal((await stat(source)).ino,(await stat(staged)).ino,'no second physical copy')
  await assert.rejects(stat(path.join(root,'output',other,name)),{code:'ENOENT'})
  await assert.rejects(stat(path.join(root,'output',id,'unrelated.txt')),{code:'ENOENT'})
  await rm(source)
  assert.equal(await readFile(staged,'utf8'),'unchanged bytes','removing a cache entry does not break a deployment')
 }finally{await rm(root,{recursive:true,force:true})}
})
test('asset staging refuses symlinked cache content',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'smp-stage-'))
 try {
  await mkdir(path.join(root,'cache',id),{recursive:true})
  await writeFile(path.join(root,'outside'),'not an asset')
  await symlink(path.join(root,'outside'),path.join(root,'cache',id,name))
  await assert.rejects(stageReaderAssets(path.join(root,'cache'),path.join(root,'output')),/links are not allowed/)
 }finally{await rm(root,{recursive:true,force:true})}
})
