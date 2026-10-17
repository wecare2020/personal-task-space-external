import {currentWorkspaceOwner,withWorkspace} from './github-workspace';
import {DataError,fingerprint,type Task} from './model';
import {ready} from './store';
import {createRoutedToken,routedTokenOwner} from './routed-token';

type ReadKey={id:string;owner_id:string;name:string;token_hash:string;created_at:number;expires_at:number;revoked_at:number|null};
const unauthorized=()=>new DataError('UNAUTHORIZED','A valid read-only API key is required.',401);
const keyMetadata=(k:ReadKey)=>({id:k.id,name:k.name,createdAt:k.created_at,expiresAt:k.expires_at,revokedAt:k.revoked_at,scope:'tasks:read' as const});
function requireKeyOwner(owner:string){if(!/^[a-f0-9]{64}$/.test(owner)||currentWorkspaceOwner()!==owner)throw unauthorized();}

export function taskReadOwner(request:Request):string{
  const token=/^Bearer pts_read_(\S+)$/i.exec(request.headers.get('authorization')||'')?.[1];
  const owner=token&&routedTokenOwner(token,'read');
  if(!owner)throw unauthorized();
  return owner;
}
export async function withTaskReadWorkspace<T>(request:Request,operation:()=>Promise<T>):Promise<T>{
  return withWorkspace(taskReadOwner(request),operation);
}
export async function authorizeTaskRead(request:Request,db:D1Database){
    const owner=taskReadOwner(request),token=/^Bearer (\S+)$/i.exec(request.headers.get('authorization')||'')![1];
    if(currentWorkspaceOwner()!==owner)throw unauthorized();
    const key=await db.prepare('SELECT * FROM native_task_read_keys WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').bind(await fingerprint(token),Date.now()).first<ReadKey>();
    if(!key||key.owner_id!==owner)throw unauthorized();
    return key.owner_id;
}

export async function listReadKeys(db:D1Database,owner:string){
  requireKeyOwner(owner);
  const rows=await db.prepare('SELECT id,owner_id,name,created_at,expires_at,revoked_at FROM native_task_read_keys WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(owner).all<ReadKey>();
  return rows.results.map(keyMetadata);
}
export async function createReadKey(db:D1Database,owner:string,body:Record<string,unknown>){
  const name=typeof body.name==='string'?body.name.trim():'';
  const days=body.days??90;
  if(!name||name.length>80||![30,90,365].includes(Number(days))||typeof days!=='number')throw new DataError('INVALID','Use a key name and an expiry of 30, 90 or 365 days.');
  requireKeyOwner(owner);
  const token='pts_read_'+createRoutedToken(owner,'read');
  const now=Date.now();
  const key:ReadKey={id:crypto.randomUUID(),owner_id:owner,name,token_hash:await fingerprint(token),created_at:now,expires_at:now+days*86_400_000,revoked_at:null};
  const result=await db.prepare('INSERT INTO native_task_read_keys(id,owner_id,name,token_hash,created_at,expires_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM native_task_read_keys WHERE owner_id=? AND revoked_at IS NULL AND expires_at>?)<20')
    .bind(key.id,owner,name,key.token_hash,now,key.expires_at,owner,now).run();
  if(!result.meta.changes)throw new DataError('KEY_LIMIT','Revoke an unused key before creating another.',409);
  return {...keyMetadata(key),token};
}
export async function revokeReadKey(db:D1Database,owner:string,id:unknown){
  requireKeyOwner(owner);
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new DataError('INVALID','Invalid key ID.');
  const result=await db.prepare('UPDATE native_task_read_keys SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner_id=?').bind(Date.now(),id,owner).run();
  if(!result.meta.changes)throw new DataError('NOT_FOUND','API key not found.',404);
  return {id,revoked:true};
}

function validateId(id:string){if(!id||id.length>150||/[\u0000-\u001f\u007f]/.test(id))throw new DataError('INVALID','Invalid task ID.');return id;}
function encodeCursor(id:string,filters:string){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({v:1,after:id,filters})))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decodeCursor(value:string,filters:string){
  if(value.length>2400||!/^[a-zA-Z0-9_-]+$/.test(value))throw new DataError('INVALID','Invalid cursor.');
  try{const cursor=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));if(cursor.v!==1||cursor.filters!==filters||typeof cursor.after!=='string')throw Error();return validateId(cursor.after);}
  catch{throw new DataError('INVALID','Invalid cursor.');}
}
async function requireNative(db:D1Database){if(!await ready(db))throw new DataError('NOT_READY','Task storage is not ready.',503);}
type ApiTaskRow={data:string;version:number;updated_at:number};
function apiTask(row:ApiTaskRow,includeDetail:boolean){const t=JSON.parse(row.data) as Task;return {id:t.id,title:t.title,date:t.date,completed:t.completed,status:t.status,isTop:t.isTop,team:t.team,projectId:t.projectId,projectIds:t.projectIds,...(t.taskType?{taskType:t.taskType}:{}),...(includeDetail?{detail:t.detail,...(t.taskForm?{taskForm:t.taskForm}:{}),...(t.discussion?{discussion:t.discussion}:{})}:{}),version:row.version,updatedAt:row.updated_at};}

export async function readApiTask(db:D1Database,id:string){
  await requireNative(db);validateId(id);
  const row=await db.prepare('SELECT data,version,updated_at FROM native_tasks WHERE id=? AND deleted=0').bind(id).first<ApiTaskRow>();
  if(!row)throw new DataError('NOT_FOUND','Task not found.',404);
  return {storage:'github',task:apiTask(row,true)};
}
export async function listApiTasks(db:D1Database,url:URL){
  await requireNative(db);
  const p=url.searchParams,allowed=['limit','cursor','completed','status','project','q','includeDetail'];
  for(const key of p.keys())if(!allowed.includes(key)||p.getAll(key).length!==1)throw new DataError('INVALID','Unsupported or duplicate query parameter: '+key);
  const completed=p.get('completed')??'active',status=p.get('status'),project=p.get('project'),q=p.get('q')??'',detail=p.get('includeDetail')??'false';
  if(!['active','completed','all'].includes(completed)||status!==null&&!['today','upcoming','later'].includes(status)||!['true','false'].includes(detail)||q.length>200||project!==null&&(!project||project.length>200))throw new DataError('INVALID','Invalid task filter.');
  const max=detail==='true'?10:100,rawLimit=p.get('limit')??(detail==='true'?'10':'50'),limit=Number(rawLimit);
  if(!/^\d+$/.test(rawLimit)||!Number.isInteger(limit)||limit<1||limit>max)throw new DataError('INVALID','limit must be between 1 and '+max+'.');
  const filters=JSON.stringify([completed,status,project,q]);
  const where=['deleted=0'],args:unknown[]=[];
  if(completed!=='all'){where.push("json_extract(data,'$.completed')=?");args.push(completed==='completed'?1:0);}
  if(status){where.push("json_extract(data,'$.status')=?");args.push(status);}
  if(project){where.push("EXISTS(SELECT 1 FROM json_each(json_extract(native_tasks.data,'$.projectIds')) p WHERE p.value=?)");args.push(project);}
  if(q){where.push("instr(lower(json_extract(data,'$.title')),lower(?))>0");args.push(q);}
  if(p.has('cursor')){where.push('id>?');args.push(decodeCursor(p.get('cursor')!,filters));}
  args.push(limit+1);
  const projection=detail==='true'?'data':"json_remove(data,'$.detail') AS data";
  const result=await db.prepare('SELECT id,'+projection+',version,updated_at FROM native_tasks WHERE '+where.join(' AND ')+' ORDER BY id ASC LIMIT ?').bind(...args).all<ApiTaskRow&{id:string}>();
  const more=result.results.length>limit,rows=result.results.slice(0,limit);
  return {storage:'github',items:rows.map(r=>apiTask(r,detail==='true')),nextCursor:more?encodeCursor(rows.at(-1)!.id,filters):null};
}

export function apiReply(result:unknown,status=200){return Response.json({ok:true,result},{status,headers:{'cache-control':'no-store','cdn-cache-control':'no-store','vary':'Cookie, Authorization','x-task-storage':'github','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});}
export function apiFailure(error:unknown){const known=error instanceof DataError;return Response.json({ok:false,code:known?error.code:'STORAGE_ERROR',error:known?error.message:'Task storage is unavailable.'},{status:known?error.status:503,headers:{'cache-control':'no-store','cdn-cache-control':'no-store','vary':'Cookie, Authorization','x-task-storage':'github','x-content-type-options':'nosniff',...(known&&error.status===401?{'www-authenticate':'Bearer realm="task-api"'}:{})}});}
export function readOnlyResponse(){return Response.json({ok:false,code:'READ_ONLY',error:'This API only supports reading tasks.'},{status:405,headers:{allow:'GET','cache-control':'no-store','cdn-cache-control':'no-store'}});}
