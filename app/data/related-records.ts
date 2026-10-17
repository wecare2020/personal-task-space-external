import {database,readState} from './db';
import {DataError} from './model';
import {ready,taskRow} from './store';
import {getPreferences} from './preferences';
import {recordValues,validId,type RelatedRecord,type RelatedLink} from '../task-form-layout';

// Independent D1 records, not copies embedded in taskForm. Stable namespaces
// reuse native_state; no schema change or initial-task-load query is needed.
const RECORD='related-record:v1:',LINK='task-related:v1:';
const recordKey=(id:string)=>RECORD+id;
const linkPrefix=(id:string)=>LINK+encodeURIComponent(id)+':';
async function checkTask(db:D1Database,id:string){if(!id||id.length>150||!await ready(db))throw new DataError('NOT_FOUND','Task is unavailable.',404);const row=await taskRow(db,id);if(!row||row.deleted)throw new DataError('NOT_FOUND','Task is unavailable.',404);}
function decode(raw:string):RelatedRecord{return JSON.parse(raw);}
export async function readRelated(params:URLSearchParams){
 const db=database();
 if(params.get('export')==='1'){const cursor=params.get('cursor')||'';if(cursor.length>300||cursor&&!cursor.startsWith(RECORD)&&!cursor.startsWith(LINK))throw new DataError('INVALID','Invalid export cursor.');const rows=await db.prepare('SELECT key,value FROM native_state WHERE key>? AND (key LIKE ? OR key LIKE ?) ORDER BY key LIMIT 26').bind(cursor,RECORD+'%',LINK+'%').all<{key:string;value:string}>();const page=rows.results.slice(0,25);return {format:'personal-related-records-v1',exportedAt:new Date().toISOString(),settings:await getPreferences(),entries:page.map(row=>({key:row.key,value:JSON.parse(row.value)})),nextCursor:rows.results.length>25?page.at(-1)!.key:null};}
 const taskId=params.get('taskId')||'',tableId=params.get('tableId')||'';await checkTask(db,taskId);
 const config=(await getPreferences()).preferences.formLayout.tables.find(t=>t.id===tableId&&t.active);if(!config)throw new DataError('INVALID','This related table is hidden or unavailable. Reload the app.');
 if(params.has('id')){const raw=await readState(db,recordKey(params.get('id')||'')),record=raw?decode(raw):null;if(!record||record.tableId!==tableId)throw new DataError('NOT_FOUND','Related record was not found.',404);return {records:[record]};}
 if(params.get('catalog')==='1'){const q=(params.get('q')||'').slice(0,100).replace(/[\\%_]/g,'\\$&');const rows=await db.prepare("SELECT value FROM native_state WHERE key LIKE ? AND json_extract(value,'$.tableId')=? AND json_extract(value,'$.title') LIKE ? ESCAPE '\\' ORDER BY json_extract(value,'$.updatedAt') DESC LIMIT 50").bind(RECORD+'%',tableId,'%'+q+'%').all<{value:string}>();return {records:rows.results.map(r=>decode(r.value))};}
 const prefix=linkPrefix(taskId);const rows=await db.prepare('SELECT value FROM native_state WHERE key>=? AND key<? AND json_extract(value,\'$.tableId\')=? LIMIT 51').bind(prefix,prefix+'\uffff',tableId).all<{value:string}>();
 const links=rows.results.map(row=>JSON.parse(row.value) as RelatedLink);if(links.length>50)throw new DataError('LIMIT','Too many linked records.');
 const records=links.length?await db.batch(links.map(link=>db.prepare('SELECT value FROM native_state WHERE key=?').bind(recordKey(link.recordId)))):[];
 return {links,records:records.flatMap(r=>r.results.map((row)=>decode((row as {value:string}).value)))};
}
export async function writeRelated(body:Record<string,unknown>){
 const db=database(),taskId=String(body.taskId||''),tableId=String(body.tableId||''),id=String(body.id||'');await checkTask(db,taskId);
 if(!validId(id)||!id.startsWith('record-'))throw new DataError('INVALID','A stable related record ID is required.');
 const table=(await getPreferences()).preferences.formLayout.tables.find(t=>t.id===tableId&&t.active);if(!table)throw new DataError('INVALID','This related table is hidden or unavailable. Reload the app.');
 const key=recordKey(id),raw=await readState(db,key),current=raw?decode(raw):null;
 if(current&&current.tableId!==tableId)throw new DataError('INVALID','Record belongs to a different table.');
 if(body.action==='create'||body.action==='update'){
  const title=body.title;if(typeof title!=='string'||!title.trim()||title.length>200)throw new DataError('INVALID','Record name is required, up to 200 characters.');
  let values;try{values=recordValues(body.values,table.fields);}catch(e){throw new DataError('INVALID',e instanceof Error?e.message:'Invalid related fields.');}
  const same=current&&current.title===title.trim()&&JSON.stringify(Object.entries(current.values).sort())===JSON.stringify(Object.entries(values).sort());
  if(body.action==='create'&&current&&!same||body.action==='update'&&(!current||!Number.isSafeInteger(body.version)||current.version!==body.version)&&!same)throw new DataError('CONFLICT','This related record changed elsewhere. Your draft is kept. Load the saved record to compare before trying again.',409);
  if(same)return current;
  const next:RelatedRecord={id,tableId,title:title.trim(),values,version:(current?.version||0)+1,updatedAt:Date.now()};
  const result=current?await db.prepare('UPDATE native_state SET value=? WHERE key=? AND value=?').bind(JSON.stringify(next),key,raw).run():await db.prepare('INSERT OR IGNORE INTO native_state(key,value) VALUES(?,?)').bind(key,JSON.stringify(next)).run();
  if(result.meta.changes!==1)throw new DataError('CONFLICT','This related record changed elsewhere. Your draft is kept.',409);return next;
 }
 if(!current)throw new DataError('NOT_FOUND','Related record was not found.',404);
 const lk=linkPrefix(taskId)+id;
 if(body.action==='link'){
  const prefix=linkPrefix(taskId),count=await db.prepare('SELECT COUNT(*) AS n FROM native_state WHERE key>=? AND key<?').bind(prefix,prefix+'\uffff').first<{n:number}>();
  const existing=await readState(db,lk);if(existing)return JSON.parse(existing);
  if((count?.n||0)>=50)throw new DataError('LIMIT','Maximum 50 related records per task.');
  const link:RelatedLink={recordId:id,tableId,linkId:'link-'+crypto.randomUUID()};
  const result=await db.prepare('INSERT OR IGNORE INTO native_state(key,value) SELECT ?,? WHERE (SELECT COUNT(*) FROM native_state WHERE key>=? AND key<?)<50').bind(lk,JSON.stringify(link),prefix,prefix+'\uffff').run();
  if(!result.meta.changes&&!await readState(db,lk))throw new DataError('LIMIT','Maximum 50 related records per task.');return JSON.parse((await readState(db,lk))!);
 }
 if(body.action==='unlink'){
  const linkRaw=await readState(db,lk);if(!linkRaw)return {unlinked:true};
  if(JSON.parse(linkRaw).linkId!==body.linkId)throw new DataError('CONFLICT','The link changed. Refresh related records before unlinking.',409);
  const result=await db.prepare('DELETE FROM native_state WHERE key=? AND value=?').bind(lk,linkRaw).run();if(result.meta.changes!==1)throw new DataError('CONFLICT','The link changed. Refresh before unlinking.',409);return {unlinked:true};
 }
 throw new DataError('INVALID','Unsupported related-record action.');
}
