// Only ciphertext leaves the trusted publisher. No tar extraction, symlinks or
// caller-selected paths: the archive accepts the two bounded asset namespaces.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { open, mkdir, readdir, lstat, rename, rm, writeFile, appendFile } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const magic=Buffer.from('SMPASSET1'), maxBytes=6*1024**3, maxFiles=19000
const allowed=/^(covers|reader-pdfs)\/[a-f0-9]{32}\/[a-f0-9]{64}\.(webp|pdf|pack|\d{4}\.bin)$/
// Sharing artwork is generated alongside covers. Keep its established names
// without allowing arbitrary JSON/images or weakening extraction boundaries.
const shared=/^covers\/_share\/[a-f0-9]{32}\/(v2-[a-f0-9]{64}-[a-f0-9]{16}\.jpg|v1-[a-f0-9]{64}\.png)$/
const assetLimit=(name)=>typeof name!=='string'?0:allowed.test(name)||shared.test(name)?128*1024**2:name==='covers/_share/manifest.json'?1024**2:0
const keyFrom=(key)=>{if(!/^[a-f0-9]{64}$/.test(key??''))throw Error('Private asset cache key is missing');return Buffer.from(key,'hex')}
async function* entries(root) {
  for(const folder of ['covers','reader-pdfs']) {
    const walk=async function*(dir) {
      let list;try{list=await readdir(path.join(root,dir))}catch(e){if(e.code==='ENOENT')return;throw e}
      for(const name of list.sort()) {
        const relative=`${dir}/${name}`,file=path.join(root,relative),stat=await lstat(file)
        if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory()))throw Error('Unsafe cache entry')
        if(stat.isDirectory()){yield* walk(relative);continue}
        const limit=assetLimit(relative)
        if(!limit)throw Error('Unexpected cache asset path')
        if(stat.size>limit)throw Error('Cache asset exceeds size budget')
        yield {relative,file,size:stat.size}
      }
    }
    yield* walk(folder)
  }
}
export async function sealCache(root,output,key) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFrom(key),iv);cipher.setAAD(magic)
  await mkdir(path.dirname(output),{recursive:true,mode:0o700})
  const temp=output+'.tmp';let bytes=0,files=0
  async function* archive() {
    for await(const e of entries(root)) {
      if(++files>maxFiles||(bytes+=e.size)>maxBytes)throw Error('Cache exceeds budget')
      const header=Buffer.from(JSON.stringify({path:e.relative,bytes:e.size})),length=Buffer.alloc(4);length.writeUInt32BE(header.length)
      yield length;yield header
      let read=0;for await(const b of createReadStream(e.file)){read+=b.length;yield b}
      if(read!==e.size)throw Error('Cache changed while archiving')
    }
  }
  try {
    await writeFile(temp,Buffer.concat([magic,iv]),{mode:0o600})
    await pipeline(archive(),cipher,createWriteStream(temp,{flags:'a'}))
    await appendFile(temp,cipher.getAuthTag())
  } catch(e){await rm(temp,{force:true});throw e}
  await rename(temp,output);return {files,bytes}
}
export async function openCache(input,root,key) {
  // Authenticate the entire ciphertext before interpreting any archive names.
  const parsedKey=keyFrom(key)
  let file;try{file=await open(input,'r')}catch(e){if(e.code==='ENOENT')return {files:0,bytes:0,missing:true};throw e}
  const temporary=input+'.verified',staging=root+'.restoring'
  let files=0,bytes=0
  try {
    const size=(await file.stat()).size
    if(size<magic.length+28||size>maxBytes+16*1024**2)throw Error('Invalid encrypted cache length')
    const head=Buffer.alloc(magic.length+12),tag=Buffer.alloc(16)
    await file.read(head,0,head.length,0);await file.read(tag,0,16,size-16)
    if(!head.subarray(0,magic.length).equals(magic))throw Error('Unsupported encrypted cache')
    const decipher=createDecipheriv('aes-256-gcm',parsedKey,head.subarray(magic.length));decipher.setAAD(magic);decipher.setAuthTag(tag)
    await pipeline(createReadStream(input,{start:head.length,end:size-17}),decipher,createWriteStream(temporary,{mode:0o600,flags:'wx'}))
    await mkdir(staging,{recursive:true,mode:0o700})
    const plain=await open(temporary,'r');let at=0
    const read=async(n)=>{const b=Buffer.alloc(n);let done=0;while(done<n){const r=await plain.read(b,done,n-done,at+done);if(!r.bytesRead)throw Error('Truncated private cache');done+=r.bytesRead}at+=n;return b}
    try {
      const total=(await plain.stat()).size,seen=new Set()
      while(at<total) {
        const length=(await read(4)).readUInt32BE();if(length>1024||length<2)throw Error('Invalid cache header')
        const e=JSON.parse((await read(length)).toString())
        const limit=assetLimit(e.path)
        if(!limit||seen.has(e.path)||!Number.isSafeInteger(e.bytes)||e.bytes<0||e.bytes>limit||at+e.bytes>total||++files>maxFiles||(bytes+=e.bytes)>maxBytes)throw Error('Unsafe cache asset')
        seen.add(e.path);const target=path.join(staging,e.path);await mkdir(path.dirname(target),{recursive:true,mode:0o700})
        const output=await open(target,'wx',0o600)
        try{let remaining=e.bytes;while(remaining){const b=await read(Math.min(remaining,1024**2));await output.write(b);remaining-=b.length}}finally{await output.close()}
      }
    }finally{await plain.close()}
    await mkdir(root,{recursive:true,mode:0o700})
    for(const folder of ['covers','reader-pdfs']) {
      // Restore runs before the publisher. Refuse to overwrite an existing tree.
      try{await lstat(path.join(root,folder));throw Error('Refusing to overwrite prepared assets')}catch(e){if(e.code!=='ENOENT')throw e}
      try{await rename(path.join(staging,folder),path.join(root,folder))}catch(e){if(e.code!=='ENOENT')throw e}
    }
    return {files,bytes}
  }finally{await file.close();await rm(temporary,{force:true});await rm(staging,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const action=process.argv[2],file='.smp-private-cache/assets.enc'
  if(!['seal','open'].includes(action))throw Error('Use seal or open')
  console.log(JSON.stringify(await(action==='seal'?sealCache('.smp-cache',file,process.env.SMP_ASSET_CACHE_KEY):openCache(file,'.smp-cache',process.env.SMP_ASSET_CACHE_KEY))))
}
