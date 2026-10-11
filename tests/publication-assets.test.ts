import{test}from'node:test'
import assert from'node:assert/strict'
import{publicationAssets,requiresAssetDeployment}from'../free/jobs/publication-assets'
const path=`/report-covers/${'a'.repeat(32)}/${'b'.repeat(64)}.webp`,next=`/report-covers/${'a'.repeat(32)}/${'c'.repeat(64)}.webp`
test('text-only publication and reused covers skip deploy; new images and code releases do not',()=>{
 const current=publicationAssets([{url:path,previewUrl:path}])
 const textOnly=publicationAssets([{url:path,previewUrl:path,excerpt:{pages:[{text:'New original text'}]}},[{type:'paragraph',paragraph:{rich_text:[{plain_text:'Edited text'}]}}]])
 assert.deepEqual(textOnly,current)
 assert.equal(requiresAssetDeployment(current,textOnly),false)
 assert.equal(requiresAssetDeployment(current,new Set()),false)
 assert.equal(requiresAssetDeployment(current,textOnly,true),true)
 const nestedImage=publicationAssets([{children:[{image:{external:{url:'https://pnusmp.com'+next}}}]}])
 assert.equal(requiresAssetDeployment(current,nestedImage),true)
 assert.deepEqual([...nestedImage],[next])
})
test('plain text and foreign URLs never enter the deploy/recovery asset set',()=>{
 const paths=publicationAssets([{excerpt:{pages:[{text:path}]}},{rich_text:[{plain_text:path,text:{content:path}}]}, {url:'https://other.example'+path},{url:path+'?tracking=1'},{url:'https://pnusmp.com.evil.example'+path}])
 assert.equal(paths.size,0)
})

test('configured publisher origin remains supported after adding a custom domain',()=>{
 const origin='https://fixture-origin.workers.dev'
 assert.deepEqual([...publicationAssets([{image:{external:{url:origin+path}}}],origin)],[path])
 assert.deepEqual([...publicationAssets([{url:'https://pnusmp.com'+path}],origin)],[path])
 assert.equal(publicationAssets([{url:'https://other.example'+path}],origin).size,0)
})
