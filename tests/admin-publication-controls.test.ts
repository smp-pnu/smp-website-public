import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicationState } from '../admin-lab/cms/publication-controls';
import type { Entry } from '../cms/model';

test('editing a published entry shows an unsaved publication action, never an already-published label',()=>{
 const entry={revision:2,approvedRevision:2,pending:false,trashedAt:null,error:null} as Entry;
 assert.deepEqual(publicationState(entry,true),{saveDisabled:false,publishDisabled:true,label:'게시'});
 assert.deepEqual(publicationState(entry,false),{saveDisabled:true,publishDisabled:true,label:'게시됨'});
 const saved={...entry,revision:3};
 assert.equal(publicationState(saved,false).publishDisabled,false);
 assert.equal(publicationState(saved,false,true).publishDisabled,true);
});
test('publication controls retain pending, validation, trash and retry protections',()=>{
 const entry={revision:2,approvedRevision:null,pending:true,trashedAt:null,error:null} as Entry;
 assert.equal(publicationState(entry,false).label,'게시 준비 중');
 assert.equal(publicationState(entry,false).publishDisabled,true);
 assert.equal(publicationState({...entry,error:'failed'},false).publishDisabled,false);
 assert.equal(publicationState({...entry,error:'failed'},false).label,'다시 게시');
 assert.equal(publicationState({...entry,pending:false},false,false,true).publishDisabled,true);
 assert.equal(publicationState({...entry,pending:false,trashedAt:'2026-10-31'},true).saveDisabled,true);
});
