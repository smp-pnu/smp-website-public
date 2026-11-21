import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,mkdir,writeFile,readFile,readdir,lstat,rm,copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
const execute=promisify(execFile)
export const isolatedMedia=()=>process.env.SMP_MEDIA_SANDBOX==='1'
const root=process.cwd(),image='smp-media-validator:1'
const cleanEnv={NODE_ENV:"production" as const,PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',HOME:process.env.HOME??'/tmp',...(process.env.DOCKER_HOST?{DOCKER_HOST:process.env.DOCKER_HOST}:{})}
let prepared:Promise<void>|undefined
async function prepare() {
  return prepared??=(async()=>{
    // Only package setup has network. No PDF, application tokens or repository
    // credentials are available in the processing container.
    const context=await mkdtemp(path.join(tmpdir(),'smp-media-build-'))
    try {
      for(const [from,to] of [['scripts/media-sandbox.Dockerfile','Dockerfile'],['scripts/pdf-requirements.txt','pdf-requirements.txt']])await copyFile(path.join(root,from),path.join(context,to))
      await execute('docker',['build','--quiet','-t',image,context],{timeout:180000,maxBuffer:1024*1024,env:cleanEnv})
    }finally{await rm(context,{recursive:true,force:true})}
  })()
}
const asset=/^(?:edition\/(report-covers|_reader-pdfs)|\.smp-cache\/(covers|reader-pdfs))\/[a-f0-9]{32}\/[a-f0-9]{64}\.(webp|pdf|pack|\d{4}\.bin)$/
export async function saveSandboxAssets<T>(result:T,files:{url:string;bytes:Buffer}[]) {
  for(const file of files) {
    const relative=file.url.replace(/^\/report-covers\//,'covers/').replace(/^\/_reader-pdfs\//,'reader-pdfs/')
    if(!asset.test(`.smp-cache/${relative}`))throw Error('Invalid prepared cache path')
    const target=path.join(root,'.smp-cache',relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.bytes)
  }
  return result
}
export async function mediaTask<T>(task:'approved'|'cover'|'pack'|'optimize'|'image'|'probe',metadata:unknown,data:Uint8Array,consume:(result:T,files:{url:string;bytes:Buffer}[])=>Promise<T>):Promise<T> {
  if(data.length>128*1024**2)throw Error('Media input exceeds budget')
  await prepare()
  const base=await mkdtemp(path.join(tmpdir(),'smp-media-task-')),input=path.join(base,'input'),output=path.join(base,'output'),name=`smp-media-${crypto.randomUUID()}`
  try {
    await mkdir(input);await mkdir(output)
    await writeFile(path.join(input,'source'),data)
    await writeFile(path.join(input,'request.json'),JSON.stringify({task,metadata}))
    await build({entryPoints:[path.join(root,'scripts/media-task.ts')],outfile:path.join(input,'task.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'})
    const args=['run','--rm','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=64','--memory=1536m','--cpus=2','--ulimit','fsize=134217728:134217728','--user',`${process.getuid?.()??1000}:${process.getgid?.()??1000}`,'--tmpfs','/tmp:rw,noexec,nosuid,size=128m',
      '--mount',`type=bind,src=${input},dst=/input,readonly`, '--mount',`type=bind,src=${output},dst=/work`,
      '--mount',`type=bind,src=${path.join(root,'node_modules')},dst=/work/node_modules,readonly`,
      '--mount',`type=bind,src=${path.join(root,'node_modules')},dst=/input/node_modules,readonly`,
      '--mount',`type=bind,src=${path.join(root,'scripts')},dst=/work/scripts,readonly`,
      image,'node','--conditions=react-server','/input/task.mjs']
    try{await execute('docker',args,{timeout:240000,maxBuffer:65536,env:cleanEnv})}
    catch{throw Error('Isolated media validation failed; previous publication retained')}
    const meta=await lstat(path.join(output,'result.json'))
    if(!meta.isFile()||meta.isSymbolicLink()||meta.size>65536)throw Error('Invalid media result')
    const result=JSON.parse(await readFile(path.join(output,'result.json'),'utf8')) as T,files:{url:string;bytes:Buffer}[]=[]
    let total=0,count=0
    async function scan(dir:string) {
      for(const name of await readdir(path.join(output,dir))) {
        const relative=dir?`${dir}/${name}`:name;if(relative==='result.json')continue
        const file=path.join(output,relative),stat=await lstat(file)
        if(stat.isSymbolicLink())throw Error('Invalid media output link')
        if(stat.isDirectory()){if(dir.split('/').length>3)throw Error('Invalid media directory');await scan(relative);continue}
        if(!stat.isFile()||(!asset.test(relative)&&relative!=='image.webp')||stat.size>128*1024**2||++count>1500||(total+=stat.size)>512*1024**2)throw Error('Media output exceeds budget')
        const bytes=await readFile(file)
        // Full file hashes (chunks are verified together by the existing asset store).
        if(/\.(webp|pack|pdf)$/.test(relative)&&relative!=='image.webp'&&createHash('sha256').update(bytes).digest('hex')!==path.basename(relative).split('.')[0])throw Error('Media output integrity mismatch')
        files.push({url:relative.replace(/^edition\//,'/').replace(/^\.smp-cache\/covers\//,'/report-covers/').replace(/^\.smp-cache\/reader-pdfs\//,'/_reader-pdfs/'),bytes})
      }
    }
    await scan('');return await consume(result,files)
  }finally{
    // Killing a Docker client alone must never leave the parser running.
    await execute('docker',['rm','-f',name],{timeout:10000,maxBuffer:4096,env:cleanEnv}).catch(()=>{})
    await rm(base,{recursive:true,force:true})
  }
}
