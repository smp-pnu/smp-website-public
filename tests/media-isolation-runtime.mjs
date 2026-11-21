import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {mediaTask} from '../free/jobs/security/media-sandbox.ts'
import {prepareApprovedPdf,LocalPublicationAssets} from '../admin-publisher/assets.ts'
import {publicationFixture} from './publication-fixture.ts'
import {fileIdentity} from '../admin-cloud/protocol.ts'
process.env.SMP_MEDIA_SANDBOX='1';process.env.SMP_MEDIA_TEST_DIAGNOSTICS='1';process.env.SMP_SANDBOX_CANARY='fixture-only-not-a-secret'
const isolation=await mediaTask('probe',{},new Uint8Array(),async result=>result)
assert.deepEqual(isolation,{network:true,noPrivileges:true,noCapabilities:true,readOnly:true,noSecrets:true})
const f=await publicationFixture(),root=await mkdtemp(path.join(tmpdir(),'smp-isolated-test-'))
try{
 const source=await f.upload();await f.change(source.draft,{type:'approve',reviewed:true});const report=(await f.source().snapshot()).reports[0]
 const assets=new LocalPublicationAssets(root);await assets.init()
 const edition=await prepareApprovedPdf(report,source.pdf,assets);await assets.verify(report,edition)
 assert.equal(edition.cover.reader.pageCount,3);assert.ok(edition.cover.reader.pagePack)
 const bad=new TextEncoder().encode('%PDF-1.7\n1 0 obj\nfalse\nendobj\n%%EOF\n')
 await assert.rejects(prepareApprovedPdf({...report,bytes:bad.length,identity:await fileIdentity(bad)},bad,assets),/Isolated media validation failed/)
 console.log('Offline media isolation, complete 3-page preparation, and malformed PDF rejection passed')
}finally{f.sqlite.close();await rm(root,{recursive:true,force:true})}
