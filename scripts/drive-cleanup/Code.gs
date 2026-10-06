/** SMP report deletion worker. Configuration belongs in Script Properties.
 * NOTION_TOKEN, REPORTS_DATA_SOURCE_ID, NOTICES_DATA_SOURCE_ID,
 * DRIVE_REPORTS_ROOT_ID. Run previewCleanup, then enableCleanup once.
 * No public content, file bytes, credentials, or permanent-delete API is used.
 */
function previewCleanup() { return smpRun_(true); }
function syncDeletedReports() { return smpRun_(false); }
function enableCleanup() {
  smpRun_(true); // Configuration/source validation must succeed first.
  const props = PropertiesService.getScriptProperties();
  props.setProperty('ENABLED', 'true');
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncDeletedReports');
  if (!triggers.length) ScriptApp.newTrigger('syncDeletedReports').timeBased().everyMinutes(5).create();
  triggers.slice(1).forEach(t => ScriptApp.deleteTrigger(t));
  console.log('SMP cleanup enabled: every 5 minutes, trash only.');
}
function disableCleanup() {
  PropertiesService.getScriptProperties().setProperty('ENABLED', 'false');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncDeletedReports')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
function cleanupStatus() {
  const props = PropertiesService.getScriptProperties();
  console.log(JSON.stringify({ enabled: props.getProperty('ENABLED') === 'true',
    lastRun: JSON.parse(props.getProperty('LAST_RUN') || 'null'),
    triggers: ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncDeletedReports').length }));
}

// An authenticated hint queue closes the gap for rows created/deleted between
// scheduled scans. Notion signatures are checked by the website before relay.
function doPost(e) {
  try {
    const cfg = smpConfig_();
    const body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || body.length > 4096) throw new Error('Invalid hint');
    const request = JSON.parse(body);
    if (typeof request.payload !== 'string' || !/^[a-f0-9]{64}$/.test(request.signature)) throw new Error('Invalid hint');
    const expected = smpHex_(Utilities.computeHmacSha256Signature('smp-drive-cleanup-v1\n' + request.payload, cfg.token, Utilities.Charset.UTF_8));
    let diff = 0;
    for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ request.signature.charCodeAt(i);
    const hint = JSON.parse(request.payload);
    if (diff || hint.version !== 1 || !smpId_(hint.pageId) || typeof hint.issuedAt !== 'number'
      || Math.abs(Date.now() - hint.issuedAt) > 600000) throw new Error('Invalid hint');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) throw new Error('Busy');
    try {
      const state = smpLoad_(cfg);
      if (Object.keys(state.pending).length >= 1000) throw new Error('Queue full');
      state.pending[smpId_(hint.pageId)] = true;
      smpSave_(state);
    } finally { lock.releaseLock(); }
    return smpJson_({ ok: true });
  } catch (_) { return smpJson_({ ok: false }); }
}
function smpJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function smpId_(value) {
  const id = String(value || '').replace(/-/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(id) ? id : null;
}
function smpConfig_() {
  const p = PropertiesService.getScriptProperties();
  const cfg = { token: p.getProperty('NOTION_TOKEN'), reports: smpId_(p.getProperty('REPORTS_DATA_SOURCE_ID')),
    notices: smpId_(p.getProperty('NOTICES_DATA_SOURCE_ID')), root: p.getProperty('DRIVE_REPORTS_ROOT_ID'),
    enabled: p.getProperty('ENABLED') === 'true', deadline: Date.now() + 180000 };
  if (!cfg.token || !cfg.reports || !cfg.notices || cfg.reports === cfg.notices || !/^[\w-]{10,200}$/.test(cfg.root || '')) {
    throw new Error('Missing or invalid cleanup Script Properties');
  }
  cfg.scope = [cfg.reports, cfg.notices, cfg.root].join(':');
  return cfg;
}
function smpHex_(bytes) { return bytes.map(x => ('0' + (x & 255).toString(16)).slice(-2)).join(''); }
function smpDigest_(text) { return smpHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)); }

// Two slots and a commit pointer keep a failed write from replacing the last
// complete checkpoint. Small shards stay under Apps Script's 9 KB limit.
function smpLoad_(cfg) {
  const props = PropertiesService.getScriptProperties().getProperties();
  if (!props.STATE_SLOT) return { version: 1, scope: cfg.scope, reports: {}, pending: {}, blocks: {} };
  const prefix = 'STATE_' + props.STATE_SLOT + '_';
  const meta = JSON.parse(props[prefix + 'META'] || 'null');
  if (!meta || !Number.isInteger(meta.count) || meta.count < 1 || meta.count > 28) throw new Error('Invalid state checkpoint');
  let raw = '';
  for (let i = 0; i < meta.count; i++) {
    if (typeof props[prefix + i] !== 'string') throw new Error('Incomplete state checkpoint');
    raw += props[prefix + i];
  }
  if (smpDigest_(raw) !== meta.hash) throw new Error('Corrupt state checkpoint');
  const state = JSON.parse(raw);
  if (state.version !== 1 || state.scope !== cfg.scope || !state.reports || !state.pending || !state.blocks) throw new Error('Cleanup scope changed; review configuration');
  return state;
}
function smpSave_(state) {
  const props = PropertiesService.getScriptProperties();
  const raw = JSON.stringify(state);
  // State holds ASCII IDs/timestamps only, never titles, content or credentials.
  if (raw.length > 220000) throw new Error('Cleanup state capacity reached');
  const hash = smpDigest_(raw);
  const current = props.getProperty('STATE_SLOT');
  const previous = current && JSON.parse(props.getProperty('STATE_' + current + '_META') || 'null');
  if (previous && previous.hash === hash) return;
  const slot = props.getProperty('STATE_SLOT') === 'A' ? 'B' : 'A';
  const prefix = 'STATE_' + slot + '_', values = {}, count = Math.ceil(raw.length / 8000);
  for (let i = 0; i < count; i++) values[prefix + i] = raw.slice(i * 8000, (i + 1) * 8000);
  values[prefix + 'META'] = JSON.stringify({ count: count, hash: hash });
  props.setProperties(values, false);
  props.setProperty('STATE_SLOT', slot);
  // Old slots can shrink after deletes. Do not retain stale large shards.
  for (const key of Object.keys(props.getProperties())) {
    if (key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)) && Number(key.slice(prefix.length)) >= count) props.deleteProperty(key);
  }
}

function smpNotion_(cfg, path, body) {
  if (Date.now() > cfg.deadline) throw new Error('Notion scan deadline exceeded');
  Utilities.sleep(350); // Under Notion's per-connection average rate limit.
  const response = UrlFetchApp.fetch('https://api.notion.com/v1/' + path, {
    method: body ? 'post' : 'get', headers: { Authorization: 'Bearer ' + cfg.token, 'Notion-Version': '2025-09-03' },
    contentType: 'application/json', ...(body ? { payload: JSON.stringify(body) } : {}), muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status !== 200) throw new Error('Notion request failed (' + status + ')');
  return JSON.parse(response.getContentText());
}
function smpPages_(cfg, source) {
  const ds = smpNotion_(cfg, 'data_sources/' + source);
  if (smpId_(ds.id) !== source || ds.in_trash || ds.archived || ds.is_archived) throw new Error('Content database is unavailable');
  const rows = [], cursors = new Set();
  let cursor;
  do {
    const result = smpNotion_(cfg, 'data_sources/' + source + '/query', { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    if (!Array.isArray(result.results) || typeof result.has_more !== 'boolean') throw new Error('Invalid Notion query');
    for (const page of result.results) {
      if (!smpId_(page.id) || smpSource_(page) !== source) throw new Error('Unexpected Notion page');
      if (!page.in_trash && !page.archived && !page.is_archived) rows.push(page);
    }
    cursor = result.has_more ? result.next_cursor : null;
    if (result.has_more && (!cursor || cursors.has(cursor))) throw new Error('Invalid Notion pagination');
    if (cursor) cursors.add(cursor);
    if (rows.length > 5000) throw new Error('Notion source capacity exceeded');
  } while (cursor);
  return rows;
}
function smpSource_(page) { return page.parent && page.parent.type === 'data_source_id' ? smpId_(page.parent.data_source_id) : null; }
function smpDriveId_(url) {
  if (typeof url !== 'string') return null;
  const path = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]{10,200})(?:[/?#]|$)/i);
  if (path) return path[1];
  if (!/^https:\/\/drive\.google\.com\/(?:open|uc|thumbnail)\?/i.test(url)) return null;
  const query = url.split('#')[0].match(/[?&]id=([\w-]{10,200})(?:&|$)/);
  return query ? query[1] : null;
}
function smpRefs_(value, found) {
  found = found || new Set();
  if (typeof value === 'string') {
    const id = smpDriveId_(value); if (id) found.add(id);
    for (const url of value.match(/https:\/\/drive\.google\.com\/[^\s<>"']+/g) || []) {
      const nested = smpDriveId_(url); if (nested) found.add(nested);
    }
  } else if (Array.isArray(value)) value.forEach(x => smpRefs_(x, found));
  else if (value && typeof value === 'object') Object.values(value).forEach(x => smpRefs_(x, found));
  return found;
}
function smpFiles_(page) {
  const p = page.properties || {};
  return Array.from(smpRefs_([p['외부 링크'], p['첨부파일']])).sort();
}

// Check body links too. Changed bodies are read incrementally, at most 60 block
// requests per run. A partial scan checkpoints progress and does not delete.
function smpReferences_(cfg, state, pages) {
  const refs = new Set(), active = new Set(pages.map(p => smpId_(p.id)));
  for (const id of Object.keys(state.blocks)) if (!active.has(id)) delete state.blocks[id];
  let budget = 60;
  for (const page of pages) {
    smpRefs_(page.properties, refs);
    const id = smpId_(page.id), edit = page.last_edited_time;
    let cache = state.blocks[id];
    if (!edit) throw new Error('Missing Notion edit timestamp');
    if (!cache || cache.edit !== edit) cache = state.blocks[id] = { edit: edit, refs: [], queue: [id + '/children'], visited: [] };
    while (cache.queue.length) {
      if (budget-- <= 0 || Date.now() > cfg.deadline - 15000) return null;
      const path = cache.queue[0];
      const result = smpNotion_(cfg, 'blocks/' + path + (path.includes('?') ? '&' : '?') + 'page_size=100');
      if (!Array.isArray(result.results) || typeof result.has_more !== 'boolean') throw new Error('Invalid Notion blocks');
      const ids = new Set(cache.refs);
      for (const block of result.results) {
        if (block.in_trash || block.archived) continue;
        smpRefs_(block, ids);
        // Linked databases/child pages are independent resources, not the body.
        if (block.has_children && !['child_page', 'child_database'].includes(block.type)) {
          if (!smpId_(block.id)) throw new Error('Invalid child block ID');
          cache.queue.push(smpId_(block.id) + '/children');
        }
      }
      cache.refs = Array.from(ids).sort();
      cache.queue.shift(); cache.visited.push(path);
      if (result.has_more) {
        if (!result.next_cursor) throw new Error('Invalid block cursor');
        const next = path.split('?')[0] + '?start_cursor=' + encodeURIComponent(result.next_cursor);
        if (cache.visited.includes(next) || cache.queue.includes(next)) throw new Error('Repeated block cursor');
        cache.queue.unshift(next);
      }
      if (cache.visited.length > 500 || cache.refs.length > 1000) throw new Error('Body reference limit exceeded');
    }
    cache.visited = [];
    cache.refs.forEach(fileId => refs.add(fileId));
  }
  return refs;
}
function smpInside_(file, rootId) {
  let parents = file.getParents(), depth = 0;
  const seen = new Set();
  while (parents.hasNext() && depth++ < 20) {
    const parent = parents.next(), id = parent.getId();
    if (parent.isTrashed() || seen.has(id)) return false;
    if (id === rootId) return true;
    seen.add(id); parents = parent.getParents();
  }
  return false;
}

function smpRun_(preview) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Cleanup already running');
  const props = PropertiesService.getScriptProperties();
  const stats = { startedAt: new Date().toISOString(), preview: !!preview, reports: 0, candidates: 0, trashed: 0, shared: 0, skipped: 0, pendingReferences: false };
  try {
    const cfg = smpConfig_(), state = smpLoad_(cfg);
    if (!preview && !cfg.enabled) return { disabled: true };
    const root = DriveApp.getFolderById(cfg.root);
    if (root.isTrashed()) throw new Error('Report folder is in trash');
    const owner = root.getOwner().getEmail();
    // Complete BOTH queries before interpreting anything as missing.
    const reports = smpPages_(cfg, cfg.reports), notices = smpPages_(cfg, cfg.notices);
    stats.reports = reports.length;
    const active = new Set(reports.map(p => smpId_(p.id)));
    for (const page of reports) {
      const id = smpId_(page.id);
      state.reports[id] = { files: smpFiles_(page) };
      delete state.pending[id];
    }
    const ids = Array.from(new Set(Object.keys(state.pending).concat(Object.keys(state.reports).filter(id => !active.has(id) && !state.reports[id].done))));
    const candidates = [];
    for (const id of ids.slice(0, 30)) {
      // A 404, permission loss or failed read aborts without guessing deletion.
      const page = smpNotion_(cfg, 'pages/' + id);
      if (smpId_(page.id) !== id) throw new Error('Page ID mismatch');
      if (smpSource_(page) !== cfg.reports || page.in_trash !== true) {
        delete state.pending[id]; delete state.reports[id]; stats.skipped++; continue;
      }
      candidates.push({ id: id, files: smpFiles_(page) });
    }
    stats.candidates = candidates.length;
    const refs = smpReferences_(cfg, state, reports.concat(notices));
    if (!refs) { stats.pendingReferences = true; smpSave_(state); return stats; }
    // Checkpoint registered files and link checks before any Drive mutation.
    smpSave_(state);
    if (candidates.length) {
      // A long body scan must not delete against an outdated reference list.
      const revisions = pages => pages.map(p => smpId_(p.id) + ':' + p.last_edited_time).sort().join('|');
      const latest = smpPages_(cfg, cfg.reports).concat(smpPages_(cfg, cfg.notices));
      if (revisions(latest) !== revisions(reports.concat(notices))) { stats.skipped += candidates.length; return stats; }
    }
    for (const candidate of candidates) {
      const page = smpNotion_(cfg, 'pages/' + candidate.id);
      if (page.in_trash !== true || smpSource_(page) !== cfg.reports || smpId_(page.id) !== candidate.id
        || JSON.stringify(smpFiles_(page)) !== JSON.stringify(candidate.files)) { stats.skipped++; continue; }
      let complete = true;
      for (const fileId of candidate.files) {
        if (refs.has(fileId)) { stats.shared++; complete = false; continue; }
        const file = DriveApp.getFileById(fileId);
        if (file.isTrashed()) continue;
        if (file.getMimeType() !== 'application/pdf' || file.getOwner().getEmail() !== owner || !smpInside_(file, cfg.root)) { stats.skipped++; continue; }
        if (!preview) {
          file.setTrashed(true);
          if (!file.isTrashed()) throw new Error('Drive did not confirm trash');
        }
        stats.trashed++;
        console.log(JSON.stringify({ action: preview ? 'would-trash' : 'trashed', pageId: candidate.id, fileId: fileId }));
      }
      if (complete && !preview) {
        state.reports[candidate.id] = { files: candidate.files, done: Date.now() };
        delete state.pending[candidate.id];
        smpSave_(state);
      }
    }
    // Retain completed deletion receipts for 35 days, never scan old PDFs.
    for (const id of Object.keys(state.reports)) if (state.reports[id].done < Date.now() - 35 * 86400000) delete state.reports[id];
    smpSave_(state);
    return stats;
  } catch (error) {
    stats.error = error instanceof Error ? error.message : 'Cleanup failed';
    throw error;
  } finally {
    stats.finishedAt = new Date().toISOString();
    props.setProperty('LAST_RUN', JSON.stringify(stats));
    console.log(JSON.stringify(stats));
    lock.releaseLock();
  }
}
