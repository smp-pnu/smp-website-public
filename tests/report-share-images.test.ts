import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {prepareReportShares} from '../free/jobs/report-shares'
import {reportSharePath,reportShareKey,reportShareCopy} from '../lib/report-share-image'
import {stageReportShares} from '../scripts/stage-report-shares.mjs'

test('report share URLs accept only local hash-addressed cover images',()=>{
  assert.equal(reportSharePath('/report-covers/'+ 'a'.repeat(32)+'/'+ 'b'.repeat(64)+'.webp'),'/report-shares/'+ 'a'.repeat(32)+'/v2-'+ 'b'.repeat(64)+'-'+reportShareKey()+'.jpg')
  for(const url of ['https://external.test/image.webp','/report-covers/../../secret.webp','/report-covers/x/short.webp'])assert.equal(reportSharePath(url),null)
})

test('publishing preserves the full portrait, reuses the result, and stages only current shares',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'smp-shares-')),id='a'.repeat(32)
  try{
    // Distinct corners expose the centre-crop bug in a landscape social card.
    const data=await sharp(Buffer.from('<svg width="400" height="600"><rect width="400" height="600" fill="white"/><rect width="400" height="50" fill="red"/><rect y="550" width="400" height="50" fill="blue"/></svg>')).webp({lossless:true}).toBuffer()
    const hash=createHash('sha256').update(data).digest('hex'),url=`/report-covers/${id}/${hash}.webp`
    await mkdir(path.join(root,id));await writeFile(path.join(root,id,hash+'.webp'),data)
    const record={id,title:'[인바디] 피트니스를 넘어 의료기기로',company:'인바디',cover:{url,previewUrl:url}}
    const files=await prepareReportShares([record],root),file=path.join(root,'_share',files[0])
    const meta=await sharp(file).metadata();assert.equal(meta.width,2400);assert.equal(meta.height,1260);assert.equal(meta.format,'jpeg')
    const rgb=await sharp(file).removeAlpha().raw().toBuffer()
    const pixel=(x:number,y:number)=>[...rgb.subarray((y*2400+x)*3,(y*2400+x)*3+3)]
    const red=pixel(1900,110),blue=pixel(1900,1140);assert.ok(red[0]>240&&red[1]<15&&red[2]<15);assert.ok(blue[2]>240&&blue[0]<15&&blue[1]<15)
    const saved=(await stat(file)).mtimeMs
    await prepareReportShares([record],root)
    assert.equal((await stat(file)).mtimeMs,saved,'unchanged source must reuse the prepared PNG')
    const changed=await prepareReportShares([{...record,title:'새로운 제목'}],root);assert.notEqual(changed[0],files[0]);await prepareReportShares([record],root)
    await writeFile(path.join(root,'_share',id,'v1-'+'c'.repeat(64)+'.png'),'unreferenced')
    const dest=path.join(root,'deploy')
    await stageReportShares(path.join(root,'_share'),dest)
    assert.deepEqual(await readdir(path.join(dest,id)),[path.basename(file)])
    assert.deepEqual(await readFile(path.join(dest,files[0])),await readFile(file))
    await writeFile(path.join(root,'_share','manifest.json'),JSON.stringify(['../escape.png']))
    await assert.rejects(()=>stageReportShares(path.join(root,'_share'),dest),/Invalid sharing image path/)
    await rm(file);await writeFile(path.join(root,id,hash+'.webp'),'changed')
    await assert.rejects(()=>prepareReportShares([record],root),/integrity/)
  }finally{await rm(root,{recursive:true,force:true})}
})

test('share copy revisions follow only visible content and preserve literal user text',()=>{
 const first={company:'인바디',title:'[인바디] 새로운 성장'}
 assert.deepEqual(reportShareCopy(first),{company:'인바디',title:'새로운 성장'})
 assert.equal(reportShareKey(first),reportShareKey({...first,title:'[인바디]  새로운 성장  '}))
 assert.notEqual(reportShareKey(first),reportShareKey({...first,title:'바뀐 제목'}))
 assert.notEqual(reportShareKey(first),reportShareKey({...first,company:'다른 기업'}))
 assert.equal(reportShareCopy({title:'<script> & \"test\"'}).title,'<script> & \"test\"')
})
