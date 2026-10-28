import test from 'node:test';
import assert from 'node:assert/strict';
import {canApply, runCmsBatch, selectEntries} from '../admin-lab/cms-bulk';
import type {Entry} from '../cms/model';
const entry=(id:string, extra:Partial<Entry>={}):Entry=>({id,kind:'notice',draft:{item:{id,kind:'notice',title:id,date:'2020-01-01',summary:'',category:'공지',author:'SMP',pinned:false,externalUrl:null,attachments:[]},cover:null,blocks:[]},revision:2,approvedRevision:null,trashedAt:null,updatedAt:'2026-10-28',source:'admin',rank:0,pending:false,error:null,...extra});
const applied=(e:Entry)=>({...e,approvedRevision:e.revision});
const http=(status:number)=>Object.assign(new Error(`HTTP ${status}`),{status});

test('selection persists across pages, deduplicates and enforces the 100-entry cap without dropping prior choices',()=>{
 const a=entry('a'),b=entry('b');
 const selected=selectEntries(selectEntries([], [a,a],true),[b],true);
 assert.deepEqual(selected.map(e=>e.id),['a','b']);
 assert.deepEqual(selectEntries(selected,[a],false).map(e=>e.id),['b']);
 const max=Array.from({length:100},(_,i)=>entry(String(i)));
 assert.throws(()=>selectEntries(max,[a],true),/100/);assert.equal(max.length,100);
});
test('eligibility protects already public, pending and trashed entries while allowing failed preparation to retry',()=>{
 assert.equal(canApply(entry('a',{approvedRevision:2}),'approve'),false);
 assert.equal(canApply(entry('a',{pending:true}),'approve'),false);
 assert.equal(canApply(entry('a',{pending:true,error:'failed'}),'approve'),true);
 assert.equal(canApply(entry('a',{pending:true}),'withdraw'),true);
 assert.equal(canApply(entry('a'),'withdraw'),false);
 assert.equal(canApply(entry('a',{trashedAt:'2026-10-28'}),'approve'),false);
 assert.equal(canApply(entry('a',{trashedAt:'2026-10-28'}),'restore'),true);
});
test('batch serializes writes with captured revisions and reports partial validation/conflict failures',async()=>{
 const calls:string[]=[],progress:number[]=[];let inFlight=0;
 const result=await runCmsBatch(['a','b','c'].map(x=>entry(x)),'approve',async(e)=>{
  assert.equal(++inFlight,1);calls.push(e.id);assert.equal(e.revision,2);
  await Promise.resolve();inFlight--;
  if(e.id==='b')throw http(409);
  return e.id==='c'?{...e,pending:true}:applied(e);
 },p=>progress.push(p.processed));
 assert.deepEqual(calls,['a','b','c']);assert.deepEqual(result.completed,['a','c']);
 assert.equal(result.pending,1);assert.deepEqual(result.failures.map(e=>e.id),['b']);
 assert.deepEqual(result.remaining,[]);assert.deepEqual(progress,[0,1,2,3]);
});
test('authentication, quota, server and uncertain network errors halt further writes and never retry',async()=>{
 for(const failure of [http(401),http(403),http(429),http(500),new Error('network')]){
  let calls=0;
  const result=await runCmsBatch(['a','b','c'].map(x=>entry(x)),'approve',async()=>{calls++;throw failure},()=>{});
  assert.equal(calls,1);assert.deepEqual(result.completed,[]);assert.deepEqual(result.remaining,['b','c']);
  assert.equal(result.failures.length,1);
 }
});
test('stop waits for the current operation and leaves remaining targets available',async()=>{
 let stop=false;
 const result=await runCmsBatch(['a','b'].map(x=>entry(x)),'approve',async e=>{stop=true;return applied(e)},()=>{},()=>stop);
 assert.deepEqual(result.completed,['a']);assert.deepEqual(result.remaining,['b']);
});
test('invalid outcomes and duplicate requests never produce a false success',async()=>{
 const result=await runCmsBatch([entry('a'),entry('b')],'trash',async e=>e,()=>{});
 assert.deepEqual(result.completed,[]);assert.equal(result.failures.length,1);assert.deepEqual(result.remaining,['b']);
 await assert.rejects(runCmsBatch([entry('a'),entry('a')],'approve',async e=>applied(e),()=>{}));
});
