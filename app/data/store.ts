import {DataError,checkEditor,checkFormClient,comparable,fingerprint,normalizeTask,patchFields,sortedObject,type Task,type TaskRow,type Project} from './model';
import {readState} from './db';
import {parsePreferences} from '../task-preferences';
import {validateCustomTaskFields,validateTypeForm,taskTypeLayout} from '../task-schema';

async function checkTaskType(db:D1Database,id:string|undefined,current?:Task){
  if(!id||id===current?.taskType)return;
  const {preferences}=parsePreferences(await readState(db,'personal_task_preferences_v1'));
  // Hidden types remain valid for undo and old tasks. The picker excludes them
  // from new selections; IDs are never renamed or deleted by Settings.
  if(!preferences.taskTypes.some(type=>type.id===id))throw new DataError('INVALID','This task type is unavailable. Reload the app to use the latest types.');
}

export async function ready(db:D1Database){return await readState(db,'ready')==='1';}
async function checkConfiguredTaskForm(db:D1Database,value:string|undefined,typeId?:string){const form=JSON.parse(value||'{}');const {preferences}=parsePreferences(await readState(db,'personal_task_preferences_v1'));try{validateCustomTaskFields(form.custom||{},preferences);validateTypeForm(form,taskTypeLayout(preferences,typeId));}catch(e){throw new DataError('INVALID',e instanceof Error?e.message:'Invalid task form.');}}
export async function nativeReadRevision(db:D1Database){
  // Versions increase on every native write (including anonymous edits and soft
  // deletes). Backup acknowledgments change neither versions nor task contents.
  const row=await db.prepare("SELECT (SELECT value FROM native_state WHERE key='ready') AS ready,COUNT(*) AS n,COALESCE(SUM(version),0) AS v,COALESCE(SUM(deleted),0) AS d,(SELECT COUNT(*) FROM native_projects) AS p FROM native_tasks").first<{ready:string|null;n:number;v:number;d:number;p:number}>();
  if(row?.ready!=='1')throw new DataError('NOT_READY','Private GitHub storage is unavailable. Cached tasks and local drafts are kept.',503);
  return `\"native-${row.n}-${row.v}-${row.d}-${row.p}\"`;
}
export async function getData(db:D1Database){const [tasks,projects]=await Promise.all([db.prepare('SELECT data FROM native_tasks WHERE deleted=0 ORDER BY rowid').all<{data:string}>(),db.prepare('SELECT data FROM native_projects ORDER BY rowid').all<{data:string}>()]);return {writeProtocol:2,storage:'native',tasks:tasks.results.map(r=>JSON.parse(r.data)),projects:projects.results.map(r=>JSON.parse(r.data))};}
export async function taskRow(db:D1Database,id:string){return db.prepare('SELECT * FROM native_tasks WHERE id=?').bind(id).first<TaskRow>();}
function conflict(row:TaskRow,fields:string[]){return new DataError('CONFLICT','This task changed in another tab or device.',409,JSON.parse(row.data),fields);}
const dirtySql='INSERT INTO native_outbox(task_id,version,attempts,next_attempt) SELECT id,version,0,0 FROM native_tasks WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM native_receipts WHERE id=?) ON CONFLICT(task_id) DO UPDATE SET version=excluded.version,next_attempt=0';

export async function mutate(db:D1Database,body:Record<string,unknown>){
  if(!await ready(db))throw new DataError('NOT_READY','Native storage is not ready.',503);
  if(body.action==='createProject'){
    const p=body.project as Partial<Project>;const name=String(p?.name||p?.id||'').replace(/\s+/g,' ').trim();if(!name||name.length>200)throw new DataError('INVALID','Invalid project.');
    const project={id:name,name,color:p.color||'bg-blue-500'};
    await db.prepare('INSERT OR IGNORE INTO native_projects(id,data,exported) VALUES(?,?,0)').bind(name,JSON.stringify(project)).run();
    return JSON.parse((await db.prepare('SELECT data FROM native_projects WHERE lower(id)=lower(?)').bind(name).first<{data:string}>())!.data);
  }
  if(body.action==='create'){
    const task=normalizeTask(body.task as Partial<Task>);if(!/^task-[a-zA-Z0-9-]{8,140}$/.test(task.id))throw new DataError('INVALID','A stable task ID is required.');
    checkFormClient(undefined,task,body.taskFormSchema);
    await checkTaskType(db,task.taskType);
    if(task.taskForm)await checkConfiguredTaskForm(db,task.taskForm,task.taskType);
    const now=Date.now();await db.batch([
      db.prepare('INSERT OR IGNORE INTO native_tasks(id,data,version,updated_at) VALUES(?,?,1,?)').bind(task.id,JSON.stringify(task),now),
      db.prepare('INSERT OR IGNORE INTO native_outbox(task_id,version) SELECT id,version FROM native_tasks WHERE id=? AND baseline IS NULL').bind(task.id),
    ]);const row=await taskRow(db,task.id);if(row?.deleted)throw conflict(row,['deleted']);return JSON.parse(row!.data);
  }
  if(body.action!=='update'&&body.action!=='delete')throw new DataError('INVALID','Unsupported action.');
  const id=String(body.id||'');const requestId=String(body.requestId||'');const patch=(body.updates||{}) as Partial<Task>;const expected=body.expectedValues as Partial<Task>;
  if(body.protocol!==2||!expected||Array.isArray(expected)||!/^[-a-zA-Z0-9]{8,100}$/.test(requestId))throw new DataError('CLIENT_UPDATE_REQUIRED','Reload before saving.',428);
  const deleting=body.action==='delete';const fields=deleting?['title','detail']:patchFields(patch).filter(k=>k!=='projectId'||'projectId' in patch);
  const hash=await fingerprint([body.action,id,sortedObject(patch),sortedObject(expected)]);
  for(let retry=0;retry<6;retry++){
    const row=await taskRow(db,id);if(!row)throw new DataError('CONFLICT','Task is missing; changes remain in local recovery.',409);
    const current:Task=JSON.parse(row.data);const receipt=await db.prepare('SELECT fingerprint FROM native_receipts WHERE id=?').bind(requestId).first<{fingerprint:string}>();
    if(receipt&&receipt.fingerprint!==hash)throw new DataError('INVALID','Request ID already used.');
    if(deleting&&row.deleted&&receipt)return current;
    if(row.deleted)throw conflict(row,['deleted']);
    checkEditor(current,patch,body.editorSchema);
    if(!deleting)checkFormClient(current,patch,body.taskFormSchema);
    const desired=deleting?current:normalizeTask({...patch,id},current);
    if(!deleting&&'taskForm' in patch)await checkConfiguredTaskForm(db,desired.taskForm,desired.taskType);
    if(!deleting&&'taskType' in patch)await checkTaskType(db,desired.taskType,current);
    const alreadyApplied=!deleting&&fields.every(k=>comparable(k,current[k as keyof Task])===comparable(k,desired[k as keyof Task]));
    const conflicts=fields.filter(k=>!(k in expected)||comparable(k,current[k as keyof Task])!==comparable(k,expected[k as keyof Task]));
    if((receipt||conflicts.length)&&!alreadyApplied)throw conflict(row,conflicts.length?conflicts:fields);
    if(receipt)return current;
    const data=JSON.stringify(desired),version=row.version+1,now=Date.now();
    // D1 batch is a transaction. The receipt is inserted only when this exact CAS wins.
    const result=await db.batch([
      db.prepare('INSERT OR IGNORE INTO native_receipts(id,fingerprint,task_id,result,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM native_tasks WHERE id=? AND version=? AND deleted=0)').bind(requestId,hash,id,data,now,id,row.version),
      db.prepare('UPDATE native_tasks SET data=?,version=?,deleted=?,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM native_receipts WHERE id=? AND result=? AND created_at=?)').bind(data,version,deleting?1:0,now,id,row.version,requestId,data,now),
      db.prepare(dirtySql).bind(id,version,requestId),
    ]);
    if(result[1].meta.changes)return desired;
  }
  throw new DataError('BUSY','Please retry this change.',503);
}
