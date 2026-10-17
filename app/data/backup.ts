import {readState,putState} from './db';
import {sheetRequest} from './sheet';
import {DataError,same,type Task,type TaskRow} from './model';
import {ready} from './store';

type Attempt={task_id:string;id:string;base:string|null;desired:string;version:number;sync_revision:number;created_at:number};
const leaseCondition="EXISTS(SELECT 1 FROM native_state WHERE key='lease' AND value=?)";
const decode=(value:string|null):Task|null=>value?JSON.parse(value):null;

// The existing Sheet bridge has fixed columns. Preserve native-only task type
// metadata losslessly in a trailing HTML comment in the backup notes, never in
// the app's canonical detail. No Apps Script or Sheet schema change is needed.
export function sheetBackupTask(task:Task|null):Task|null{
  if(!task)return null;
  const {taskType,taskForm,discussion,...fields}=task;
  const metadata={v:1,...(taskType?{taskType}:{}),...(taskForm?{taskForm}:{}),...(discussion?{discussion}:{})};
  return Object.keys(metadata).length>1?{...fields,detail:fields.detail+'<!--sites-task-metadata:'+encodeURIComponent(JSON.stringify(metadata)).replace(/-/g,'%2D')+'-->'}:fields;
}

export async function backupStatus(db:D1Database){
  const [states,pending,projects,archives]=await Promise.all([
    db.prepare("SELECT key,value FROM native_state WHERE key IN ('ready','backupPaused','lease','lastSuccess','lastRun','error','runnerLastSeen','backupMode')").all<{key:string;value:string}>(),
    db.prepare('SELECT COUNT(*) AS n FROM native_outbox').first<{n:number}>(),
    db.prepare('SELECT COUNT(*) AS n FROM native_projects WHERE exported=0').first<{n:number}>(),
    db.prepare("SELECT DISTINCT task_id FROM native_recovery WHERE reason IN ('sync-conflict-both-versions','before-backup-overwrite','two-way-sync-retired') UNION SELECT task_id FROM native_conflicts").all<{task_id:string}>(),
  ]);
  const state=Object.fromEntries(states.results.map(s=>[s.key,s.value]));
  const lease=state.lease?JSON.parse(state.lease):null;
  const initialized=state.backupMode==='one-way';
  return {native:state.ready==='1',mode:'backup-only',paused:state.backupPaused==='1',running:!!lease&&lease.until>Date.now(),pending:(pending?.n||0)+(projects?.n||0),lastSuccess:initialized?Number(state.lastSuccess||0):0,lastRun:initialized?Number(state.lastRun||0):0,error:initialized?state.error||null:null,runnerLastSeen:Number(state.runnerLastSeen||0),archives:archives.results.map(r=>r.task_id),initializing:!initialized};
}

async function retireTwoWaySync(db:D1Database,lease:string){
  if(await readState(db,'backupMode')==='one-way')return;
  // Preserve both versions before retiring conflicts. Only backup metadata changes;
  // task data, native versions, receipts, shares and client drafts are untouched.
  await db.batch([
    db.prepare(`INSERT INTO native_recovery(id,task_id,data,reason,created_at) SELECT 'retired-sync:'||task_id,task_id,json_object('base',json(base),'local',json(local),'remote',json(remote),'fields',json(fields)),'two-way-sync-retired',? FROM native_conflicts WHERE ${leaseCondition}`).bind(Date.now(),lease),
    db.prepare(`DELETE FROM native_conflicts WHERE ${leaseCondition}`).bind(lease),
    db.prepare(`INSERT INTO native_outbox(task_id,version) SELECT id,version FROM native_tasks WHERE ${leaseCondition} ON CONFLICT(task_id) DO UPDATE SET version=MAX(native_outbox.version,excluded.version)`).bind(lease),
    db.prepare(`UPDATE native_projects SET exported=0 WHERE ${leaseCondition}`).bind(lease),
    db.prepare(`UPDATE native_state SET value='0' WHERE key IN ('lastSuccess','retryAt','failures') AND ${leaseCondition}`).bind(lease),
    db.prepare(`UPDATE native_state SET value='' WHERE key='error' AND ${leaseCondition}`).bind(lease),
    db.prepare(`INSERT INTO native_state(key,value) SELECT 'backupMode','one-way' WHERE ${leaseCondition} ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(lease),
  ]);
}

async function ack(db:D1Database,attempt:Attempt,lease:string){
  // Never acknowledge a newer edit with an older backup response, or a stale lease.
  await db.batch([
    db.prepare(`UPDATE native_tasks SET baseline=?,sync_revision=sync_revision+1 WHERE id=? AND sync_revision=? AND ${leaseCondition}`).bind(attempt.desired==='null'?null:attempt.desired,attempt.task_id,attempt.sync_revision,lease),
    db.prepare(`DELETE FROM native_sync_attempts WHERE task_id=? AND id=? AND ${leaseCondition} AND EXISTS(SELECT 1 FROM native_tasks WHERE id=? AND sync_revision=?)`).bind(attempt.task_id,attempt.id,lease,attempt.task_id,attempt.sync_revision+1),
    db.prepare(`DELETE FROM native_outbox WHERE task_id=? AND version<=? AND ${leaseCondition} AND EXISTS(SELECT 1 FROM native_tasks WHERE id=? AND sync_revision=? AND version=?)`).bind(attempt.task_id,attempt.version,lease,attempt.task_id,attempt.sync_revision+1,attempt.version),
  ]);
}

async function saveAttempt(db:D1Database,attempt:Attempt,lease:string){
  const result=await db.prepare(`INSERT OR IGNORE INTO native_sync_attempts(task_id,id,base,desired,version,sync_revision,created_at) SELECT ?,?,?,?,?,?,? WHERE ${leaseCondition}`).bind(attempt.task_id,attempt.id,attempt.base,attempt.desired,attempt.version,attempt.sync_revision,attempt.created_at,lease).run();
  return !!result.meta.changes;
}

export async function runBackup(db:D1Database,fromRunner=false){
  if(fromRunner)await putState(db,'runnerLastSeen',String(Date.now())).run();
  if(!await ready(db))return {ready:false};
  // The old pause enabled manual Sheet editing. It is intentionally not a
  // backup pause; otherwise cutover from safe-edit mode would never run.
  if(await readState(db,'backupPaused')==='1')return {paused:true};
  const now=Date.now();
  const initialized=await readState(db,'backupMode')==='one-way';
  if(initialized&&Number(await readState(db,'retryAt')||0)>now)return {retrying:true};
  if(initialized&&now-Number(await readState(db,'lastRun')||0)<3000)return {scheduled:true};
  const lease=JSON.stringify({token:crypto.randomUUID(),until:now+600000});
  const acquired=await db.prepare("INSERT INTO native_state(key,value) VALUES('lease',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(native_state.value,'$.until') AS INTEGER)<?").bind(lease,now).run();
  if(!acquired.meta.changes)return {busy:true};
  let uncertain=false,exports=0;const started=Date.now();
  try{
    await retireTwoWaySync(db,lease);
    const rows=(await db.prepare('SELECT t.* FROM native_outbox o JOIN native_tasks t ON t.id=o.task_id WHERE o.next_attempt<=? ORDER BY o.next_attempt,t.rowid LIMIT 4').bind(now).all<TaskRow>()).results;
    const projects=(await db.prepare('SELECT id,data FROM native_projects WHERE exported=0 ORDER BY rowid LIMIT 1').all<{id:string;data:string}>()).results;
    if(!rows.length&&!projects.length)return {upToDate:true};
    await putState(db,'lastRun',String(now)).run();
    for(const row of rows){
      if(Date.now()-started>18000||await readState(db,'backupPaused')==='1')break;
      const existing=await db.prepare('SELECT * FROM native_sync_attempts WHERE task_id=?').bind(row.id).first<Attempt>();
      let attempt:Attempt=existing??{task_id:row.id,id:crypto.randomUUID(),base:row.baseline,desired:row.deleted?'null':row.data,version:row.version,sync_revision:row.sync_revision,created_at:Date.now()};
      if(!existing){
        if(!await saveAttempt(db,attempt,lease))continue;
      }
      // Conditional writes reuse the existing Sheet bridge. No snapshots, scans,
      // imports or merge logic run in Sites. A manual Sheet edit is archived, then
      // replaced by the D1 backup, never written into native_tasks.
      for(let retry=0;retry<2;retry++){
        if(await readState(db,'lease')!==lease)return {leaseLost:true};
        if(await readState(db,'backupPaused')==='1')break;
        uncertain=true;
        try{
          const desired=sheetBackupTask(decode(attempt.desired));
          const result=await sheetRequest({action:'nativeApply',id:row.id,attemptId:attempt.id,base:sheetBackupTask(decode(attempt.base)),desired}) as {task:Task|null};
          uncertain=false;
          if(!same(result.task,desired))throw new Error('Backup verification failed.');
          await ack(db,attempt,lease);exports++;break;
        }catch(error){
          if(!(error instanceof DataError&&error.code==='CONFLICT'))throw error;
          uncertain=false;
          const remote=error.currentTask||null;
          const replacement:Attempt={...attempt,id:crypto.randomUUID(),base:remote?JSON.stringify(remote):null,created_at:Date.now()};
          const result=await db.batch([
            db.prepare(`INSERT INTO native_recovery(id,task_id,data,reason,created_at) SELECT ?,?,?, 'before-backup-overwrite',? WHERE ${leaseCondition}`).bind('backup:'+attempt.id,row.id,JSON.stringify({local:decode(attempt.desired),remote}),Date.now(),lease),
            db.prepare(`DELETE FROM native_sync_attempts WHERE task_id=? AND id=? AND ${leaseCondition}`).bind(row.id,attempt.id,lease),
          ]);
          if(!result[1].meta.changes||!await saveAttempt(db,replacement,lease))break;
          attempt=replacement;
        }
      }
    }
    if(Date.now()-started<18000&&await readState(db,'backupPaused')!=='1')for(const project of projects){
      if(await readState(db,'lease')!==lease)return {leaseLost:true};
      uncertain=true;
      await sheetRequest({action:'createProject',project:JSON.parse(project.data)});
      uncertain=false;
      await db.prepare(`UPDATE native_projects SET exported=1 WHERE id=? AND data=? AND ${leaseCondition}`).bind(project.id,project.data,lease).run();
    }
    await db.batch([
      db.prepare(`INSERT INTO native_state(key,value) SELECT 'lastSuccess',? WHERE ${leaseCondition} ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(String(Date.now()),lease),
      db.prepare(`INSERT INTO native_state(key,value) SELECT 'error','' WHERE ${leaseCondition} ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(lease),
      db.prepare(`INSERT INTO native_state(key,value) SELECT 'retryAt','0' WHERE ${leaseCondition} ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(lease),
      db.prepare(`INSERT INTO native_state(key,value) SELECT 'failures','0' WHERE ${leaseCondition} ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(lease),
    ]);
    return {ok:true,exports};
  }catch{
    const failures=Number(await readState(db,'failures')||0)+1;
    const delay=uncertain?600000:Math.min(600000,30000*2**Math.min(failures,5));
    await db.batch([
      db.prepare(`INSERT INTO native_state(key,value) SELECT 'error','Tasks are saved in D1. Sheet backup is delayed; automatic retry is scheduled.' WHERE ${leaseCondition} ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(lease),
      db.prepare(`INSERT INTO native_state(key,value) SELECT 'failures',? WHERE ${leaseCondition} ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(String(failures),lease),
      db.prepare(`INSERT INTO native_state(key,value) SELECT 'retryAt',? WHERE ${leaseCondition} ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(String(Date.now()+delay),lease),
    ]);
    return {ok:false,retrying:true};
  }finally{
    // A timeout may still finish in Apps Script; keep its immutable attempt and
    // ten-minute fence. Routine backup failure never changes a native task.
    if(!uncertain)await db.prepare("DELETE FROM native_state WHERE key='lease' AND value=?").bind(lease).run();
  }
}
