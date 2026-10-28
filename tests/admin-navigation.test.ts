import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminRouteHash,readAdminRoute} from '../admin-lab/admin-navigation';
import {entryListPath} from '../admin-lab/cms/entry-list-query';
import {siteSearchMatches} from '../lib/site-search-query';

test('admin deep links retain article, cohort and filtered page context, with bounded input',()=>{
 const route={section:'research' as const,q:'반도체 & 성장',group:'2026-2',filter:'draft',page:3,entry:'a'.repeat(32)};
 assert.deepEqual(readAdminRoute(adminRouteHash(route)),route);
 assert.deepEqual(readAdminRoute('#members?group=40'),{section:'members',q:'',group:'40',filter:'all',page:1});
 assert.equal(readAdminRoute('#unknown').section,'dashboard');
 for(const page of ['0','-1','NaN','1.5'])assert.equal(readAdminRoute('#research?page='+page).page,1);
 assert.equal(readAdminRoute('#research?page=999999').page,1000);
 assert.equal(readAdminRoute('#research?q='+'x'.repeat(500)).q.length,100);
 assert.equal(readAdminRoute('#storage?entry='+'a'.repeat(32)).entry,undefined);
 assert.equal(readAdminRoute('#research?entry=https://elsewhere.test').entry,undefined);
 assert.equal(readAdminRoute('#research?filter=unknown').filter,'all');
});
test('admin list queries skip non-list views and preserve escaped search/trash state',()=>{
 const base={section:'research' as const,q:'A&B / 기업',group:'2026-2',filter:'trash',page:2};
 const url=new URL(entryListPath(base)!,'https://example.test');
 assert.equal(url.pathname,'/research');assert.equal(url.searchParams.get('q'),base.q);
 assert.equal(url.searchParams.get('trash'),'1');assert.equal(url.searchParams.get('state'),'all');assert.equal(url.searchParams.get('page'),'2');
 assert.equal(entryListPath({...base,section:'storage'}),null);
 assert.equal(entryListPath({...base,section:'members',group:''}),null);
 assert.ok(entryListPath({...base,section:'members',group:'40'})?.startsWith('/members?'));
});
test('search displays public team names while still accepting original filing codes',()=>{
 const row={title:'기업 리포트',text:'기업분석 · R1 · 123456',href:'/research/'+'a'.repeat(32),label:'리포트'};
 assert.equal(siteSearchMatches([row],'R1')[0]?.text,'기업분석 · 리서치 1팀 · 123456');
 assert.equal(siteSearchMatches([row],'리서치 1팀').length,1);
 const notice={...row,label:'공지'};assert.equal(siteSearchMatches([notice],'R1')[0]?.text,notice.text);
});
