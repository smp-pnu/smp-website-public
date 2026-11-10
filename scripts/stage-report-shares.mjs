import {mkdir,readFile,copyFile} from 'node:fs/promises'
import path from 'node:path'

// Copy only the current, validated manifest. Retired cache files stay private
// on the runner and are never republished just because a cache restored them.
export async function stageReportShares(source,destination,fixture=false) {
  let files
  try{files=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'))}
  catch(error){if(fixture&&error.code==='ENOENT')return;throw error}
  if(!Array.isArray(files)||files.length>1000)throw Error('Invalid sharing image manifest')
  for(const file of files) {
    if(typeof file!=='string'||!/^[a-f0-9]{32}\/v1-[a-f0-9]{64}\.png$/.test(file))throw Error('Invalid sharing image path')
    if(fixture&&!file.startsWith('a0000000000000000000000000000001/'))continue
    const target=path.join(destination,file)
    await mkdir(path.dirname(target),{recursive:true})
    await copyFile(path.join(source,file),target)
  }
}
