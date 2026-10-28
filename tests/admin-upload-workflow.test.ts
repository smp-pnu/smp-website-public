import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {pendingUploads,linkedUpload,type UploadLink} from '../admin-lab/upload-workflow'
import {adminSection,saveUploadReturn,readUploadReturn,clearUploadReturn} from '../admin-lab/admin-navigation'
import {uploadLinks} from '../cms/upload-links'
import type {Draft} from '../admin-lab/model'
import type {Database} from '../cloudflare/bindings'

test('PDF intake excludes linked, migrated-by-identity and trashed uploads, preserving unrelated pending files',()=>{
  const first={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',hash:'a'.repeat(64),trashedAt:null} as Draft
  const migrated={...first,id:'b'.repeat(32),hash:'b'.repeat(64)}
  const pending={...first,id:'c'.repeat(32),hash:'c'.repeat(64)}
  const links:UploadLink[]=[{id:'1'.repeat(32),title:'Linked',uploadId:'a'.repeat(32),identity:null,trashedAt:'2026-10-28'}, {id:'2'.repeat(32),title:'Migrated',uploadId:null,identity:migrated.hash,trashedAt:null}]
  assert.equal(linkedUpload(first,links)?.id,links[0].id)
  assert.equal(linkedUpload(migrated,links)?.id,links[1].id)
  assert.deepEqual(pendingUploads([first,migrated,pending,{...pending,id:'d'.repeat(32),trashedAt:'2026-10-28'}],links),[pending])
})

test('upload reference query returns only linkage metadata, including trashed references',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cms/schema.sql','utf8'))
  const insert=sql.prepare('INSERT INTO cms_entries(id,kind,draft,updated_at,trashed_at) VALUES(?,?,?,?,?)')
  insert.run('a'.repeat(32),'research',JSON.stringify({item:{title:'Report',managedPdf:{identity:'b'.repeat(64)}},upload:{id:'c'.repeat(32),report:{secret:'must not return'}}}),new Date().toISOString(),'2026-10-28')
  insert.run('b'.repeat(32),'notice',JSON.stringify({item:{title:'Notice'},upload:{id:'x'}}),new Date().toISOString(),null)
  insert.run('c'.repeat(32),'research',JSON.stringify({item:{title:'Legacy URL only'}}),new Date().toISOString(),null)
  const db={prepare:(s:string)=>({bind:(...p:any[])=>({all:async()=>({results:sql.prepare(s).all(...p)})})})} as unknown as Database
  const values=await uploadLinks(db)
  assert.deepEqual(JSON.parse(JSON.stringify(values)),[{id:'a'.repeat(32),title:'Report',uploadId:'c'.repeat(32),identity:'b'.repeat(64),trashedAt:'2026-10-28'}])
  sql.close()
})

test('upload return survives an OAuth reload with bounded target and expires safely',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'), map=new Map<string,string>()
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{setItem:(k:string,v:string)=>map.set(k,v),getItem:(k:string)=>map.get(k)??null,removeItem:(k:string)=>map.delete(k)}})
  try{
    saveUploadReturn('a'.repeat(32),'Original title');assert.equal(readUploadReturn()?.target,'a'.repeat(32))
    clearUploadReturn();assert.equal(readUploadReturn(),null)
    for(const value of [{expires:Date.now()-1},{expires:Date.now()+1000,target:'https://evil.test'},{expires:Date.now()+1000,title:9}]){map.set('smp-admin-upload-return',JSON.stringify(value));assert.equal(readUploadReturn(),null)}
    assert.equal(adminSection('#upload'),'upload');assert.equal(adminSection('#storage'),'storage');assert.equal(adminSection('#unknown'),'dashboard')
  }finally{if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else Reflect.deleteProperty(globalThis,'sessionStorage')}
})
