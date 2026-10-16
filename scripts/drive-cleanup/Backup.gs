/** Private, bounded backup using the project's existing Notion/Drive access.
 * Additional Script Property: MEMBERS_DATA_SOURCE_ID.
 * Run enableBackups once; no web app deployment or public endpoint is added.
 */
function enableBackups() {
  const cfg = smpConfig_(), props = PropertiesService.getScriptProperties();
  if (!smpId_(props.getProperty('MEMBERS_DATA_SOURCE_ID'))) throw new Error('Missing MEMBERS_DATA_SOURCE_ID');
  smpBackupFolder_();
  props.setProperty('BACKUP_ENABLED', 'true');
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runBackups');
  if (!triggers.length) ScriptApp.newTrigger('runBackups').timeBased().everyHours(1).create();
  triggers.slice(1).forEach(t => ScriptApp.deleteTrigger(t));
  runBackups();
}
function backupStatus() {
  const p = PropertiesService.getScriptProperties();
  console.log(JSON.stringify({enabled:p.getProperty('BACKUP_ENABLED') === 'true',lastRun:JSON.parse(p.getProperty('BACKUP_LAST_RUN') || 'null'),folder:p.getProperty('BACKUP_FOLDER_ID')}));
}
function smpBackupFolder_() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('BACKUP_FOLDER_ID');
  const folder = id ? DriveApp.getFolderById(id) : DriveApp.createFolder('SMP 웹사이트 · 비공개 복구 백업');
  // Do not silently widen or change sharing. Stop if somebody shared the backup.
  if (folder.isTrashed() || folder.getSharingAccess() !== DriveApp.Access.PRIVATE || folder.getEditors().length || folder.getViewers().length) throw new Error('Backup folder must remain private');
  if (!id) p.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}
function smpBackupState_(folder) {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('BACKUP_STATE_ID');
  if (!id) return {version:1,week:'',sources:[],queue:[],items:{},assets:{},bytes:0};
  const raw = DriveApp.getFileById(id).getBlob().getDataAsString();
  if (smpDigest_(raw) !== p.getProperty('BACKUP_STATE_HASH')) throw new Error('Backup checkpoint invalid');
  const state = JSON.parse(raw);
  if (state.version !== 1 || !Array.isArray(state.queue)) throw new Error('Backup checkpoint unsupported');
  return state;
}
function smpSaveBackup_(folder,state) {
  const p = PropertiesService.getScriptProperties(), raw = JSON.stringify(state), old = p.getProperty('BACKUP_STATE_ID');
  if (smpDigest_(raw) === p.getProperty('BACKUP_STATE_HASH')) return;
  const file = folder.createFile('backup-index-' + Date.now() + '.json', raw, MimeType.PLAIN_TEXT);
  if (smpDigest_(file.getBlob().getDataAsString()) !== smpDigest_(raw)) throw new Error('Backup checkpoint verification failed');
  p.setProperties({BACKUP_STATE_ID:file.getId(),BACKUP_STATE_HASH:smpDigest_(raw)});
  const previous = p.getProperty('BACKUP_PREVIOUS_STATE_ID');
  if (previous && previous !== old) DriveApp.getFileById(previous).setTrashed(true);
  if (old) p.setProperty('BACKUP_PREVIOUS_STATE_ID',old);
}
function smpBackupSpace_(state,bytes) {
  const limit=DriveApp.getStorageLimit(),used=DriveApp.getStorageUsed();
  if (bytes > 50*1024*1024 || state.bytes + bytes > 2*1024*1024*1024 || (limit > 0 && used + bytes > limit*0.85)) throw new Error('Backup storage safety limit');
}
function smpBackupJson_(folder,state,name,data) {
  const content=JSON.stringify(data), blob=Utilities.newBlob(content,'application/json',name);
  const bytes=blob.getBytes().length;smpBackupSpace_(state,bytes);
  const file=folder.createFile(blob);state.bytes+=bytes;return file.getId();
}
function smpBackupNotion_(cfg,path,body) {
  if(cfg.backupDay.calls>=300) throw new Error('Backup daily request limit');
  cfg.backupDay.calls++;return smpNotion_(cfg,path,body);
}
function smpBackupBlocks_(cfg,id,budget) {
  const blocks=[];let cursor;
  do {
    if (--budget.remaining<0) throw new Error('Backup page exceeds block limit');
    const result=smpBackupNotion_(cfg,'blocks/'+id+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):''));
    if (!Array.isArray(result.results)) throw new Error('Invalid backup body');
    for (const block of result.results) {
      if (block.archived || block.in_trash) continue;
      if(block.has_children && !['child_page','child_database'].includes(block.type)) block.children=smpBackupBlocks_(cfg,block.id,budget);
      blocks.push(block);
    }
    cursor=result.has_more?result.next_cursor:null;
    if(result.has_more&&!cursor) throw new Error('Invalid backup pagination');
  } while(cursor);
  return blocks;
}
function smpBackupAssets_(folder,state,page,blocks,cfg,day) {
  const refs=Array.from(smpRefs_([page.properties,blocks])), files=[];
  for(const id of refs) {
    if(Date.now()>cfg.deadline-10000) throw new Error('Backup time limit');
    const original=DriveApp.getFileById(id);
    if(original.isTrashed() || !smpInside_(original,cfg.root)) continue;
    const key='drive:'+id+':'+original.getLastUpdated().getTime()+':'+original.getSize();
    if(state.assets[key]) {files.push({source:id,backup:state.assets[key]});continue;}
    const size=original.getSize();smpBackupSpace_(state,size);
    if(day.bytes+size>100*1024*1024) throw new Error('Backup daily byte limit');
    const copy=original.makeCopy('pdf-'+id+'-'+original.getLastUpdated().getTime()+'-'+original.getName(),folder);
    if(copy.getSharingAccess()!==DriveApp.Access.PRIVATE) {copy.setTrashed(true);throw new Error('Copy is not private');}
    state.assets[key]=copy.getId();state.bytes+=size;day.bytes+=size;
    files.push({source:id,backup:copy.getId()});
  }
  // Preserve uploaded Notion images/files before signed URLs expire. External
  // websites are not fetched; their links remain in the JSON for manual review.
  const uploads=[];
  function walk(value) {
    if(!value||typeof value!=='object')return;
    if(value.type==='file'&&value.file&&typeof value.file.url==='string')uploads.push(value.file.url);
    Object.values(value).forEach(child=>{if(Array.isArray(child))child.forEach(walk);else if(child&&typeof child==='object')walk(child);});
  }
  walk(page.properties);walk({blocks});
  for(const url of Array.from(new Set(uploads))) {
    if(!/^https:\/\/(?:prod-files-secure\.s3\.us-west-2\.amazonaws\.com|s3\.us-west-2\.amazonaws\.com|file\.notion\.so)\//i.test(url))continue;
    const key='notion:'+smpDigest_(url.split('?')[0])+':'+page.last_edited_time;
    if(state.assets[key]){files.push({source:url.split('?')[0],backup:state.assets[key]});continue;}
    if(Date.now()>cfg.deadline-10000)throw new Error('Backup time limit');
    const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false});
    if(response.getResponseCode()!==200)throw new Error('Backup upload unavailable');
    const blob=response.getBlob(),size=blob.getBytes().length;smpBackupSpace_(state,size);
    if(day.bytes+size>100*1024*1024)throw new Error('Backup daily byte limit');
    const copy=folder.createFile(blob.setName('upload-'+smpDigest_(key).slice(0,24)));
    state.assets[key]=copy.getId();state.bytes+=size;day.bytes+=size;files.push({source:url.split('?')[0],backup:copy.getId()});
  }
  return files;
}
function runBackups() {
  const props=PropertiesService.getScriptProperties();if(props.getProperty('BACKUP_ENABLED')!=='true')return;
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  let state,folder,day,stats={at:new Date().toISOString(),processed:0,pending:0,status:'ready'};
  try {
    const cfg=smpConfig_();cfg.deadline=Date.now()+150000;
    folder=smpBackupFolder_();state=smpBackupState_(folder);
    const today=new Date().toISOString().slice(0,10);
    day=JSON.parse(props.getProperty('BACKUP_DAY')||'null');if(!day||day.date!==today)day={date:today,pages:0,bytes:0,calls:0,runtime:0};
    if(day.calls>=300||day.runtime>=900000){stats.status='daily_limit';return;}
    cfg.backupDay=day;
    const week=String(Math.floor(Date.now()/(7*86400000)));
    if(!state.queue.length&&state.week!==week) {
      // All source metadata, including drafts, is private. No API secrets or
      // application credentials are part of these backups.
      const sources=[['research',cfg.reports],['notice',cfg.notices],['members',smpId_(props.getProperty('MEMBERS_DATA_SOURCE_ID'))]];
      const recruit=smpId_(props.getProperty('RECRUITMENT_DATA_SOURCE_ID'));if(recruit)sources.push(['recruitment',recruit]);
      if(!sources[2][1])throw new Error('Members source missing');
      const next=[];
      for(const entry of sources) {
        const pages=smpPages_(cfg,entry[1]);
        const schema=smpNotion_(cfg,'data_sources/'+entry[1]);
        const file=smpBackupJson_(folder,state,'catalog-'+entry[0]+'-'+today+'.json',{version:1,createdAt:stats.at,schema:schema,pages:pages});
        for(const page of pages) {
          if(state.items[page.id]&&state.items[page.id].revision===page.last_edited_time)continue;
          next.push({id:page.id,kind:entry[0],revision:page.last_edited_time,catalog:file,attempts:0});
        }
      }
      state.queue=next;state.week=week;smpSaveBackup_(folder,state);
    }
    const catalogs={};
    while(state.queue.length&&stats.processed<24&&day.pages<256&&Date.now()<cfg.deadline-30000) {
      const item=state.queue[0];
      try {
        // Members without uploaded photos need no additional Notion request.
        if(!catalogs[item.catalog])catalogs[item.catalog]=JSON.parse(DriveApp.getFileById(item.catalog).getBlob().getDataAsString()).pages;
        let page=catalogs[item.catalog].find(p=>p.id===item.id);
        if(!page)throw new Error('Missing backup page');
        const hasUpload=JSON.stringify(page.properties).includes('"type":"file"');
        if(!['members','recruitment'].includes(item.kind)||hasUpload)page=smpBackupNotion_(cfg,'pages/'+item.id);
        if(page.archived||page.in_trash){state.queue.shift();continue;}
        const blocks=['members','recruitment'].includes(item.kind)?[]:smpBackupBlocks_(cfg,item.id,{remaining:25});
        const files=smpBackupAssets_(folder,state,page,blocks,cfg,day);
        const file=smpBackupJson_(folder,state,'page-'+item.id+'-'+Date.now()+'.json',{version:1,kind:item.kind,createdAt:stats.at,page:page,blocks:blocks,files:files});
        state.items[item.id]={revision:page.last_edited_time,backup:file};state.queue.shift();stats.processed++;day.pages++;
      } catch(error) { stats.status='deferred';if(!/daily|time limit|deadline/.test(String(error.message))){item.attempts++;if(item.attempts>=3){item.attention=true;state.queue.push(state.queue.shift());}}break; }
      smpSaveBackup_(folder,state);
    }
    stats.pending=state.queue.length;stats.bytes=state.bytes;stats.total=Object.keys(state.items).length;
    if(!state.queue.length)stats.status='complete';
    else if(day.pages>=256||day.bytes>=100*1024*1024)stats.status='daily_limit';
  } catch(_) {stats.status='needs_review';}
  finally {
    if(folder&&state){try{smpSaveBackup_(folder,state);}catch(_){stats.status="needs_review";}}
    if(day){day.runtime=(day.runtime||0)+Date.now()-Date.parse(stats.at);props.setProperty('BACKUP_DAY',JSON.stringify(day));}
    stats.pending=state?state.queue.length:stats.pending;
    stats.total=state?Object.keys(state.items).length:0;
    stats.attention=state?state.queue.filter(item=>item.attention).length:0;
    props.setProperty('BACKUP_LAST_RUN',JSON.stringify(stats));
    try{smpBackupNotify_(stats,folder);}catch(_){}
    lock.releaseLock();console.log(JSON.stringify(stats));
  }
}

function verifyBackups() {
  const folder=smpBackupFolder_(),state=smpBackupState_(folder),sample=Object.values(state.items).slice(0,3);
  let verified=0;
  for(const entry of sample) {
    const file=DriveApp.getFileById(entry.backup);
    if(file.getSharingAccess()!==DriveApp.Access.PRIVATE)throw new Error('Backup file is shared');
    const data=JSON.parse(file.getBlob().getDataAsString());
    if(data.version!==1||!smpId_(data.page.id)||!Array.isArray(data.blocks)||!Array.isArray(data.files))throw new Error('Invalid restoration document');
    for(const asset of data.files) {
      const copy=DriveApp.getFileById(asset.backup);
      if(copy.isTrashed()||copy.getSize()<1)throw new Error('Backup asset unavailable');
    }
    verified++;
  }
  if(!verified)throw new Error('No completed backup yet');
  console.log(JSON.stringify({verifiedDocuments:verified,pending:state.queue.length,private:true,format:1}));
}

function smpBackupNotify_(stats,folder) {
  const props=PropertiesService.getScriptProperties(),id=smpId_(props.getProperty('BACKUP_STATUS_PAGE_ID'));if(!id||!folder||Number(props.getProperty('NOTION_BACKOFF_UNTIL'))>Date.now())return;
  const fingerprint=JSON.stringify([stats.status,stats.pending,stats.total,stats.attention]);
  if(props.getProperty('BACKUP_STATUS_FINGERPRINT')===fingerprint)return;
  const state=stats.status==='needs_review'||stats.attention?'확인 필요':stats.pending?'준비 중':'게시 완료';
  const message='비공개 Drive 복구 백업: '+(stats.total||0)+'건 완료 · '+stats.pending+'건 대기. 전체 목록·속성은 주간 스냅샷에 포함됩니다. 본문·원본 파일은 변경분만 순차 보관하며 일 처리량·100MB/일·백업 2GB·Drive 85% 상한에서 멈춥니다. '+(state==='확인 필요'?'Apps Script 백업 실행 기록과 저장공간을 확인해주세요.':'');
  const response=UrlFetchApp.fetch('https://api.notion.com/v1/pages/'+id,{method:'patch',headers:{Authorization:'Bearer '+props.getProperty('NOTION_TOKEN'),'Notion-Version':'2025-09-03'},contentType:'application/json',payload:JSON.stringify({properties:{상태:{select:{name:state}},원문:{url:'https://drive.google.com/drive/folders/'+folder.getId()},안내:{rich_text:[{type:'text',text:{content:message}}]}}}),muteHttpExceptions:true,followRedirects:false});
  if(response.getResponseCode()===200)props.setProperty('BACKUP_STATUS_FINGERPRINT',fingerprint);
}
