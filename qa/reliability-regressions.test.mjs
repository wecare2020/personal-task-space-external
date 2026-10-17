import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Execute the current implementation. Only Google/Storage boundaries are mocked.
const site = new URL('../', import.meta.url);
const requireSite = createRequire(new URL('package.json', site));
const ts = requireSite('typescript');
const apiSource = readFileSync(new URL('integrations/apps-script/Api.js', site), 'utf8');
const sheetSource = readFileSync(new URL('integrations/apps-script/SheetService.js', site), 'utf8');
const codeSource = readFileSync(new URL('integrations/apps-script/Code.js', site), 'utf8');
const storageSource = ts.transpileModule(readFileSync(new URL('app/reliability.ts', site), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function backend(initial = {}) {
  const data = [
    ['Title', 'Completed', 'Date', 'Status', '', 'Team', 'Detail', 'App ID', 'Project'],
    [initial.title ?? 'Task', initial.completed ?? false, '2026-09-20T00:00:00.000Z', initial.status ?? 'Today', '', false, initial.detail ?? '<p>Original notes</p>', 'task-qa-stable', 'Finance'],
  ];
  const projects = [['Project'], ['Finance'], ['Sales']];
  const properties = new Map();
  let writes = 0;
  let lockHeld = false;
  let lockAcquisitions = 0;
  function sheet(rows) {
    return {
      getLastRow: () => rows.length,
      getRange(row, column, height = 1, width = 1) {
        return {
          getValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => rows[row - 1 + i]?.[column - 1 + j] ?? '')),
          getValue: () => rows[row - 1]?.[column - 1] ?? '',
          setValues(values) {
            assert.equal(lockHeld, true, 'Sheet mutation must be inside doPost ScriptLock');
            writes++;
            for (let i = 0; i < values.length; i++) {
              rows[row - 1 + i] ??= [];
              for (let j = 0; j < values[i].length; j++) rows[row - 1 + i][column - 1 + j] = values[i][j];
            }
          },
          setValue(value) { this.setValues([[value]]); },
        };
      },
      deleteRow(row) { assert.equal(lockHeld, true); writes++; rows.splice(row - 1, 1); },
    };
  }
  const tasks = sheet(data);
  const projectSheet = sheet(projects);
  const spreadsheet = { getSheetByName: name => name === 'Tasks' ? tasks : name === 'Projects' ? projectSheet : null };
  const context = vm.createContext({
    TASK_SHEET: 'Tasks', PROJECT_SHEET: 'Projects', SITES_API_TOKEN: 'local-test-only', MS_PER_DAY: 86400000,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush() {} },
    LockService: { getScriptLock: () => ({
      waitLock() { assert.equal(lockHeld, false); lockHeld = true; lockAcquisitions++; },
      releaseLock() { assert.equal(lockHeld, true); lockHeld = false; },
    }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_algorithm, value) => [...createHash('sha256').update(value).digest()],
      base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) ?? null,
      setProperty: (key, value) => properties.set(key, value),
      deleteProperty: key => properties.delete(key),
      getProperties: () => Object.fromEntries(properties),
    }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  });
  vm.runInContext(sheetSource, context, { filename: 'actual/SheetService.js' });
  vm.runInContext(apiSource, context, { filename: 'actual/Api.js' });
  vm.runInContext(codeSource, context, { filename: 'actual/Code.js' });
  vm.runInContext(readFileSync(new URL('integrations/apps-script/NativeSync.js',site),'utf8'),context,{filename:'actual/NativeSync.js'});
  const current = () => JSON.parse(JSON.stringify(context.apiGetData().tasks[0]));
  const post = payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ token: 'local-test-only', ...payload }) } }).text);
  const update = (updates, expectedValues, requestId) => post({ action: 'update', protocol: 2, id: 'task-qa-stable', updates, expectedValues, requestId });
  return { current, post, update, writes: () => writes, locks: () => lockAcquisitions, properties, data };
}

function storageHarness() {
  const local = new Map();
  let writerSequence = 0;
  const makeStorage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
  function document(session = new Map()) {
    const context = vm.createContext({ exports: {}, window: {}, crypto: { randomUUID: () => `writer-${++writerSequence}` }, localStorage: makeStorage(local), sessionStorage: makeStorage(session) });
    vm.runInContext(storageSource, context, { filename: 'actual/reliability.ts' });
    return { ...context.exports, session };
  }
  return { document, local };
}

for(const detail of ['<details><summary>Title</summary><p>Body</p></details>','<hr>','<figure data-editor-media="image"><img src="https://example.com/a.png"></figure>'])test('old editor cannot erase unsupported blocks: '+detail.slice(0,16),()=>{
  const app=backend({detail});const old=app.update({detail:'<p>Flattened</p>'},{detail},'request-old-editor');
  assert.equal(old.code,'CLIENT_UPDATE_REQUIRED');assert.equal(app.writes(),0);
  const fresh=app.post({action:'update',protocol:2,editorSchema:3,id:'task-qa-stable',requestId:'request-new-editor',updates:{detail:detail+'<p>More</p>'},expectedValues:{detail}});
  assert.equal(fresh.ok,true);assert.equal(app.writes(),1);
});

for(const detail of ['<div data-editor-callout="a"><p>Note</p></div>','<div data-editor-columns="2"><div data-editor-column="1"><p>First</p></div></div>'])test('layout formats reject schema3 saves and accept schema4',()=>{
 const app=backend({detail});const payload={action:'update',protocol:2,id:'task-qa-stable',updates:{detail:'<p>Flattened</p>'},expectedValues:{detail},requestId:'layout-old',editorSchema:3};
 assert.equal(app.post(payload).code,'CLIENT_UPDATE_REQUIRED');assert.equal(app.writes(),0);
 assert.equal(app.post({...payload,requestId:'layout-current',editorSchema:4,updates:{detail:detail+'<p>More</p>'}}).ok,true);assert.equal(app.writes(),1);
 const fresh=backend();assert.equal(fresh.post({...payload,requestId:'layout-insert-old',updates:{detail},expectedValues:{detail:fresh.current().detail}}).code,'CLIENT_UPDATE_REQUIRED');assert.equal(fresh.writes(),0);
});

test('checkbox notes reject stale Sheet clients and accept schema5 with layouts',()=>{
 const detail='<div data-editor-callout="a"><p data-editor-todo="true"><b>Done</b></p></div>';
 const app=backend({detail});const payload={action:'update',protocol:2,id:'task-qa-stable',requestId:'todo-guard',updates:{detail:'<p>Lost</p>'},expectedValues:{detail}};
 for(const editorSchema of [2,3,4])assert.equal(app.post({...payload,editorSchema}).code,'CLIENT_UPDATE_REQUIRED');
 assert.equal(app.writes(),0);
 assert.equal(app.post({...payload,editorSchema:5,updates:{detail:detail+'<p>Next</p>'}}).ok,true);
 assert.equal(app.writes(),1);
});

test('CAS rejects stale notes and includes current task without a second write', () => {
  const app = backend(); const original = app.current();
  const first = app.update({ detail: '<p>Device A</p>' }, { detail: original.detail }, 'request-device-a');
  assert.equal(first.ok, true);
  const stale = app.update({ detail: '<p>Device B</p>' }, { detail: original.detail }, 'request-device-b');
  assert.equal(stale.ok, false); assert.equal(stale.code, 'CONFLICT');
  assert.deepEqual(stale.fields, ['detail']); assert.equal(stale.currentTask.detail, '<p>Device A</p>');
  assert.equal(app.current().detail, '<p>Device A</p>'); assert.equal(app.writes(), 1);
});

test('disjoint status and team writes preserve newer notes', () => {
  const app = backend(); const original = app.current();
  assert.equal(app.update({ detail: '<p>New notes from other device</p>' }, { detail: original.detail }, 'request-note-first').ok, true);
  assert.equal(app.update({ status: 'upcoming', isTop: false }, { status: original.status, isTop: original.isTop }, 'request-status-next').ok, true);
  assert.equal(app.update({ team: true }, { team: original.team }, 'request-team-next').ok, true);
  assert.equal(app.current().detail, '<p>New notes from other device</p>');
  assert.equal(app.current().status, 'upcoming'); assert.equal(app.current().team, true); assert.equal(app.writes(), 3);
});

test('canonical title retry is acknowledged without writing a second time', () => {
  const app = backend(); const original = app.current();
  const args = [{ title: '  Canonical title  ' }, { title: original.title }, 'request-trimmed-title'];
  const first = app.update(...args); const replay = app.update(...args);
  assert.equal(first.ok, true); assert.equal(first.result.task.title, 'Canonical title');
  assert.equal(replay.ok, true); assert.equal(replay.result.replayed, true); assert.equal(app.writes(), 1);
});

test('known request replay cannot overwrite later remote edits', () => {
  const app = backend(); const original = app.current();
  assert.equal(app.update({ title: 'First edit' }, { title: original.title }, 'request-first-edit').ok, true);
  assert.equal(app.update({ title: 'Later edit' }, { title: 'First edit' }, 'request-later-edit').ok, true);
  const replay = app.update({ title: 'First edit' }, { title: original.title }, 'request-first-edit');
  assert.equal(replay.ok, false); assert.equal(replay.code, 'CONFLICT');
  assert.equal(app.current().title, 'Later edit'); assert.equal(app.writes(), 2);
});

test('request ID reused with a different payload never mutates the Sheet', () => {
  const app = backend(); const original = app.current();
  assert.equal(app.update({ title: 'First title' }, { title: original.title }, 'request-reuse-check').ok, true);
  const collision = app.update({ title: 'Other title' }, { title: 'First title' }, 'request-reuse-check');
  assert.equal(collision.ok, false); assert.match(collision.error, /already used/);
  assert.equal(app.current().title, 'First title'); assert.equal(app.writes(), 1);
});

test('serialized Complete true/false/true and late retries cannot regress final state', async () => {
  const app = backend();
  const operations = [
    [{ completed: true }, { completed: false }, 'request-complete-one'],
    [{ completed: false }, { completed: true }, 'request-complete-two'],
    [{ completed: true }, { completed: false }, 'request-complete-three'],
  ];
  const outcomes = await Promise.all(operations.map(args => Promise.resolve().then(() => app.update(...args))));
  assert.equal(outcomes.every(result => result.ok), true); assert.equal(app.current().completed, true); assert.equal(app.writes(), 3);
  assert.equal(app.update(...operations[0]).ok, true);
  const staleUndo = app.update(...operations[1]); assert.equal(staleUndo.ok, false); assert.equal(staleUndo.code, 'CONFLICT');
  assert.equal(app.current().completed, true); assert.equal(app.writes(), 3); assert.equal(app.locks(), 5);
});

test('legacy protocol writes are rejected before any Sheet mutation', () => {
  const app = backend();
  const response = app.post({ action: 'update', id: 'task-qa-stable', updates: { completed: true } });
  assert.equal(response.ok, false); assert.equal(response.code, 'CLIENT_UPDATE_REQUIRED');
  assert.equal(app.current().completed, false); assert.equal(app.writes(), 0);
});

test('status-only update applies its isTop side effect and replay remains idempotent', () => {
  const app = backend({ status: 'Top of mind' }); const original = app.current();
  assert.equal(original.status, 'today'); assert.equal(original.isTop, true);
  const args = [{ status: 'today' }, { status: 'today', isTop: true }, 'request-status-coupling'];
  assert.equal(app.update(...args).ok, true); assert.equal(app.current().isTop, false);
  const replay = app.update(...args); assert.equal(replay.ok, true); assert.equal(replay.result.replayed, true); assert.equal(app.writes(), 1);
});

test('a cleared migrated draft stays cleared in the same document and after reload', () => {
  const harness = storageHarness(); const first = harness.document();
  first.writeOwnedRecord('detail-draft', 'task-1', { html: 'draft', updatedAt: 1 });
  const second = harness.document(first.session); assert.equal(second.readOwnedRecord('detail-draft', 'task-1').html, 'draft');
  second.clearOwnedRecord('detail-draft', 'task-1', 'html', 'draft');
  assert.equal(second.readOwnedRecord('detail-draft', 'task-1'), null);
  const third = harness.document(second.session); assert.equal(third.readOwnedRecord('detail-draft', 'task-1'), null);
});

test('rapid reloads before draft hydration preserve predecessor recovery', () => {
  const harness = storageHarness(); const first = harness.document();
  first.writeOwnedRecord('detail-draft', 'task-1', { html: 'recover me', updatedAt: 1 });
  const second = harness.document(first.session); second.writerIdentity();
  const third = harness.document(second.session); third.writerIdentity();
  const fourth = harness.document(third.session); assert.equal(fourth.readOwnedRecord('detail-draft', 'task-1').html, 'recover me');
});

test('duplicate tab edits and clears do not touch another writer draft', () => {
  const harness = storageHarness(); const first = harness.document();
  first.writeOwnedRecord('detail-draft', 'task-1', { html: 'first tab', updatedAt: 1 });
  const duplicate = harness.document(new Map(first.session));
  assert.equal(duplicate.readOwnedRecord('detail-draft', 'task-1').html, 'first tab');
  duplicate.writeOwnedRecord('detail-draft', 'task-1', { html: 'duplicate tab', updatedAt: 2 });
  duplicate.clearOwnedRecord('detail-draft', 'task-1', 'html', 'duplicate tab');
  assert.equal(first.readOwnedRecord('detail-draft', 'task-1').html, 'first tab');
  assert.equal(duplicate.readOwnedRecord('detail-draft', 'task-1'), null);
});

test('clearing an old value cannot erase a newer draft owned by the same writer', () => {
  const harness = storageHarness(); const owner = harness.document();
  owner.writeOwnedRecord('detail-draft', 'task-1', { html: 'new value', updatedAt: 2 });
  owner.clearOwnedRecord('detail-draft', 'task-1', 'html', 'old value');
  assert.equal(owner.readOwnedRecord('detail-draft', 'task-1').html, 'new value');
});

test('resolved empty mutation journal survives reload without replaying ancestors', () => {
  const harness = storageHarness(); const first = harness.document();
  first.writeMutationJournal([{ requestId: 'request-recover-1', id: 'task-1', updates: { completed: true }, expectedValues: { completed: false }, createdAt: 1 }]);
  const second = harness.document(first.session); assert.equal(second.readMutationJournal().length, 1);
  second.writeMutationJournal([]);
  const third = harness.document(second.session); assert.equal(third.readMutationJournal().length, 0);
});

test('field stamp rejects earlier completion response when newer same-value intent exists', () => {
  const owner = storageHarness().document();
  assert.equal(owner.fieldStampMatches({ 'task-1:completed': 3 }, 'task-1', 'completed', 1), false);
  assert.equal(owner.fieldStampMatches({ 'task-1:completed': 3 }, 'task-1', 'completed', 3), true);
});

console.log(`Actual source: ${fileURLToPath(new URL('integrations/apps-script/Api.js', site))}`);
test('native export uncompletes a manual Done status without readback mismatch',()=>{
 const s=backend({status:'Done'}),base=s.current(),desired={...base,completed:false};
 const response=s.post({action:'nativeApply',id:base.id,attemptId:'attempt-uncomplete',base,desired});
 assert.equal(response.ok,true);assert.equal(response.result.task.completed,false);assert.equal(s.data[1][3],'Today');
});
test('native export rejects duplicate stable IDs instead of writing the first row',()=>{
 const s=backend(),base=s.current();s.data.push([...s.data[1]]);
 const result=s.post({action:'nativeApply',id:base.id,attemptId:'attempt-duplicate',base,desired:{...base,title:'New'}});
 assert.equal(result.ok,false);assert.equal(s.writes(),0);
});
test('persisted legacy row IDs stay with the task after Sheet sorting',()=>{
 const s=backend();s.data[1][7]='row-70';const base=s.current();s.properties.set('native:backup','verified-backup');
 const result=s.post({action:'update',id:'row-70',protocol:2,editorSchema:4,requestId:'legacy-stable-70',updates:{title:'Updated'},expectedValues:{title:base.title}});
 assert.equal(result.ok,true);assert.equal(s.data[1][0],'Updated');
 const missing=s.post({action:'update',id:'row-2',protocol:2,editorSchema:4,requestId:'legacy-unknown-2',updates:{title:'Wrong'},expectedValues:{title:'Updated'}});
 assert.equal(missing.ok,false);assert.equal(s.data[1][0],'Updated');
});
test('table notes reject stale Sheet clients and schema 6 round-trips all mixed formats',()=>{
 const detail='<div data-editor-table="qa"><table><tbody><tr><th>Tên</th><th>Owner</th></tr><tr><td>Việt Nam\nDòng hai</td><td>A</td></tr></tbody></table></div><p data-editor-todo="true">Done</p><details><summary>Section</summary><p>Kept</p></details><div data-editor-callout="a">Note</div>';
 const app=backend({detail});const payload={action:'update',protocol:2,id:'task-qa-stable',requestId:'table-guard',updates:{detail:'<p>Lost</p>'},expectedValues:{detail}};
 for(const editorSchema of [undefined,2,3,4,5])assert.equal(app.post({...payload,editorSchema}).code,'CLIENT_UPDATE_REQUIRED');
 assert.equal(app.writes(),0);
 const next=detail+'<p>After table</p>';
 assert.equal(app.post({...payload,editorSchema:6,updates:{detail:next}}).ok,true);assert.equal(app.current().detail,next);assert.equal(app.writes(),1);
 const fresh=backend();assert.equal(fresh.post({...payload,editorSchema:5,updates:{detail},expectedValues:{detail:fresh.current().detail}}).code,'CLIENT_UPDATE_REQUIRED');assert.equal(fresh.writes(),0);
});
