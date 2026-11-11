import {mkdir,readFile,copyFile} from 'node:fs/promises'
import path from 'node:path'
import {validateReportShareFiles,pruneReportShareFiles} from './report-share-files.mjs'

// Copy only the current manifest and remove retired images, even when a
// destination from an earlier build is reused.
export async function stageReportShares(source,destination,fixture=false) {
  let files
  try{files=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'))}
  catch(error){if(fixture&&error.code==='ENOENT')return;throw error}
  validateReportShareFiles(files)
  files=files.filter(file=>!fixture||file.startsWith('a0000000000000000000000000000001/'))
  for(const file of files) {
    const target=path.join(destination,file)
    await mkdir(path.dirname(target),{recursive:true})
    await copyFile(path.join(source,file),target)
  }
  await pruneReportShareFiles(destination,files)
}
