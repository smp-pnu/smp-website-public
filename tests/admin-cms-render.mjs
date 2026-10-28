// Pure server rendering verifies escaping and structural controls, without a
// browser or a connection to any local/live website.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir,rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const target=path.resolve('.smp-tools/cms-render-check.mjs')
await mkdir(path.dirname(target),{recursive:true})
const source=`
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {NoticeContent} from './admin-lab/notice-preview';import {ReportList} from './admin-lab/report-list';
import {ListPagination} from './admin-lab/list-pagination';import {CmsBulkControls} from './admin-lab/cms-bulk-controls';
import {defaultQuery} from './admin-lab/library-model';import {emptyFields} from './admin-lab/model';
export const content=renderToStaticMarkup(<NoticeContent blocks={[
 {id:'1',type:'paragraph',text:'<script>alert(1)</script>',href:'javascript:alert(1)'},
 {id:'2',type:'heading',text:'행사 안내'},
 {id:'3',type:'image',assetId:'test',text:'사진 설명'},
 {id:'4',type:'paragraph',text:'공식 홈페이지',href:'https://pnusmp.com'}
]}/>);
const rows=Array.from({length:25},(_,i)=>({id:String(i),filename:'sample.pdf',fields:{...emptyFields(),title:'회사 '+i,company:'기업',semester:'2026-2',author:'리서치 1팀'},pages:3,revision:1,approvedRevision:null,trashedAt:null}));
export const listing=renderToStaticMarkup(<ReportList drafts={rows} allDrafts={rows} criteria={defaultQuery} managed loading={false} onCriteria={()=>{}} onSelect={()=>{}} onRefresh={()=>{}} onMove={async()=>{}} onBatch={async()=>{}}/>);
export const pages=renderToStaticMarkup(<ListPagination page={3} pages={5} disabled={false} onPage={()=>{}}/>);
export const longPages=[1,9,17].map(page=>renderToStaticMarkup(<ListPagination page={page} pages={17} disabled={false} onPage={()=>{}}/>));
export const bulk=renderToStaticMarkup(<CmsBulkControls entries={[{id:'a',revision:1,approvedRevision:1,pending:false,trashedAt:null}]} visibleCount={0} trash={false} disabled={false} progress={null} stopping={false} onAction={()=>{}} onClear={()=>{}} onStop={()=>{}}/>);
`
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:target,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/server','lucide-react'],define:{'import.meta.env.MODE':'"admin-cloud"'}})
 const {content,listing,pages,longPages,bulk}=await import(pathToFileURL(target).href)
 assert.ok(content.includes('&lt;script&gt;'));assert.ok(!content.includes('<script>'));assert.ok(!content.includes('javascript:'))
 assert.ok(content.includes('src="/api/notice-assets/test"'));assert.ok(content.includes('href="https://pnusmp.com/"'))
 assert.equal((listing.match(/class="report-link"/g)||[]).length,20)
 assert.ok(listing.includes('모든 학기'));assert.ok(listing.includes('현재 페이지 앞 5개 선택'));assert.ok(listing.includes('aria-label="2페이지"'))
 assert.ok(!pages.includes('<select'));assert.equal((pages.match(/class="cms-page-number"/g)||[]).length,5);assert.ok(pages.includes('aria-label="3페이지" aria-current="page"'))
 for(const html of longPages){assert.ok(html.includes('aria-label="1페이지"'));assert.ok(html.includes('aria-label="17페이지"'));assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.ok((html.match(/class="cms-page-number"/g)||[]).length<=7)}
 assert.ok(bulk.includes('선택 비공개'));assert.ok(bulk.includes('선택 삭제'));assert.ok(bulk.includes('페이지를 옮겨도 선택 유지'))
 console.log(JSON.stringify({result:'pass',checks:['escaped notice text','safe links','authenticated image path','20-row pagination','order and selection controls']}))
} finally {await rm(target,{force:true})}
