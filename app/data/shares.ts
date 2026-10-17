import {DataError, fingerprint, normalizeTask, checkEditor, type Task, type TaskRow} from './model';
import {imageReferences, shareHtml} from './share-html';
import {imageId} from '../image-files';
import {imageBody,verifyImageOrigin} from './images';
import {getImage,imageKey,receiveImage} from './github-assets';
import {currentWorkspaceOwner} from './github-workspace';
import {createRoutedToken,routedTokenOwner} from './routed-token';

export type SharePermission='private'|'view'|'edit';
export type ShareRow={task_id:string;token:string;token_hash:string;owner_id:string;permission:SharePermission;generation:number;updated_at:number};
const gone=()=>new DataError('SHARE_UNAVAILABLE','This shared link is unavailable.',404);
const grantSql="EXISTS(SELECT 1 FROM native_task_shares s WHERE s.task_id=? AND s.token_hash=? AND s.generation=? AND s.permission='edit')";
const grantArgs=(s:ShareRow)=>[s.task_id,s.token_hash,s.generation];
export async function grant(db:D1Database,token:string,edit=false):Promise<ShareRow>{
  if(shareOwner(token)!==currentWorkspaceOwner())throw gone();
  const s=await db.prepare("SELECT s.* FROM native_task_shares s JOIN native_tasks t ON t.id=s.task_id AND t.deleted=0 WHERE s.token_hash=? AND s.permission IN ('view','edit')").bind(await fingerprint(token)).first<ShareRow>();
  if(!s)throw gone();
  if(s.owner_id!==currentWorkspaceOwner())throw gone();
  if(edit&&s.permission!=='edit')throw new DataError('READ_ONLY','This link allows viewing only.',403);
  return s;
}
export function shareOwner(token:string){const owner=routedTokenOwner(token,'share');if(!owner)throw gone();return owner;}
export async function ownerShare(db:D1Database,id:string,origin:string){
  const row=await db.prepare('SELECT id FROM native_tasks WHERE id=? AND deleted=0').bind(id).first();
  if(!row)throw gone();
  const s=await db.prepare('SELECT * FROM native_task_shares WHERE task_id=?').bind(id).first<ShareRow>();
  return {permission:s?.permission||'private',generation:s?.generation||0,url:s&&s.permission!=='private'?origin+'/s/'+s.token:null};
}
export async function setShare(db:D1Database,owner:string,id:string,body:Record<string,unknown>,origin:string){
  if(owner!==currentWorkspaceOwner()||!/^[a-f0-9]{64}$/.test(owner))throw gone();
  const permission=body.permission;
  if(!['private','view','edit'].includes(String(permission))||!Number.isSafeInteger(body.generation))throw new DataError('INVALID','Invalid share settings.');
  const prior=await db.prepare('SELECT * FROM native_task_shares WHERE task_id=?').bind(id).first<ShareRow>();
  if((prior?.generation||0)!==body.generation)throw new DataError('CONFLICT','Sharing changed elsewhere. Reopen Share and try again.',409);
  const fresh=createRoutedToken(owner,'share');
  const token=!prior||prior.permission==='private'||permission==='private'||body.rotate===true?fresh:prior.token;
  const generation=(prior?.generation||0)+1;
  const result=await db.prepare('INSERT INTO native_task_shares(task_id,token,token_hash,owner_id,permission,generation,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM native_tasks WHERE id=? AND deleted=0) ON CONFLICT(task_id) DO UPDATE SET token=excluded.token,token_hash=excluded.token_hash,owner_id=excluded.owner_id,permission=excluded.permission,generation=excluded.generation,updated_at=excluded.updated_at WHERE native_task_shares.generation=?')
    .bind(id,token,await fingerprint(token),owner,permission,generation,Date.now(),id,body.generation).run();
  if(!result.meta.changes)throw new DataError('CONFLICT','Sharing changed elsewhere. Reopen Share and try again.',409);
  return ownerShare(db,id,origin);
}
async function assets(db:D1Database,s:ShareRow){
  const rows=await db.prepare('SELECT asset_id FROM native_share_assets WHERE task_id=?').bind(s.task_id).all<{asset_id:string}>();
  return new Set(rows.results.map(r=>r.asset_id.slice(s.task_id.length+1)));
}
export async function mapOwnerAssets(db:D1Database,s:ShareRow,html:string,origin:string){
  const known=await assets(db,s), refs=await imageReferences(html,origin);
  // Guest writes cannot introduce an unmapped private UUID; only owner/Sheet content can.
  for(const id of refs){if(known.has(id))continue;const key=imageKey(s.owner_id,id);
    if(await getImage(s.owner_id,id)){await db.prepare('INSERT OR IGNORE INTO native_share_assets(asset_id,task_id,r2_key) VALUES(?,?,?)').bind(s.task_id+'|'+id,s.task_id,key).run();known.add(id);}
  }
  return known;
}
export async function sharedTask(db:D1Database,token:string,origin:string){
  const s=await grant(db,token);
  const row=await db.prepare('SELECT * FROM native_tasks WHERE id=? AND deleted=0').bind(s.task_id).first<TaskRow>();
  if(!row)throw gone();
  const task=JSON.parse(row.data) as Task;
  const ids=await mapOwnerAssets(db,s,task.detail,origin);
  const detail=await shareHtml(task.detail,{origin,token,assets:ids,mode:'read'});
  await grant(db,token); // Recheck after asset I/O, including revocation during this request.
  return {title:task.title,detail,version:row.version,permission:s.permission};
}
export async function limitShare(db:D1Database,s:ShareRow,kind:'write'|'image'|'chunk'){
  const window=Math.floor(Date.now()/60000),key=s.task_id+':'+kind,max=kind==='image'?12:kind==='chunk'?60:120;
  const result=await db.prepare('INSERT INTO native_share_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN native_share_limits.window=excluded.window THEN native_share_limits.count+1 ELSE 1 END WHERE native_share_limits.window<>excluded.window OR native_share_limits.count<? RETURNING count').bind(key,window,max).first();
  if(!result)throw new DataError('RATE_LIMIT','Please wait a minute before trying again. Your draft is kept.',429);
}
export async function editSharedTask(db:D1Database,token:string,body:Record<string,unknown>,origin:string){
  const s=await grant(db,token,true);
  if(Object.keys(body).some(k=>!['title','detail','version','requestId','editorSchema'].includes(k))||typeof body.title!=='string'||!body.title.trim()||body.title.length>2000||typeof body.detail!=='string'||body.detail.length>1_000_000||!Number.isSafeInteger(body.version)||!/^[-\w]{8,100}$/.test(String(body.requestId||'')))throw new DataError('INVALID','Invalid shared edit.');
  await limitShare(db,s,'write');
  const ids=await assets(db,s);
  const detail=await shareHtml(body.detail,{origin,token,assets:ids,mode:'write'});
  const published=await imageReferences(detail,origin);
  const title=body.title.trim(),hash=await fingerprint([title,detail,body.version]);
  const receiptId='share:'+s.token_hash+':'+s.generation+':'+body.requestId;
  const receipt=await db.prepare('SELECT fingerprint FROM native_receipts WHERE id=?').bind(receiptId).first<{fingerprint:string}>();
  if(receipt){if(receipt.fingerprint!==hash)throw new DataError('INVALID','Request already used.');await grant(db,token,true);return {version:Number(body.version)+1};}
  const row=await db.prepare('SELECT * FROM native_tasks WHERE id=? AND deleted=0').bind(s.task_id).first<TaskRow>();
  if(!row)throw gone();
  if(row.version!==body.version)throw new DataError('CONFLICT','Someone else changed this task. Your draft is kept; review the latest version before saving.',409);
  const current=JSON.parse(row.data) as Task;
  // Older anonymous clients must not silently flatten a newly introduced tree.
  if(/\b(?:data-editor-tree|data-blocknote-document)\s*=/i.test(current.detail+detail))checkEditor(current,{detail},body.editorSchema);
  const next=normalizeTask({...current,title,detail},current),marker=crypto.randomUUID(),now=Date.now();
  const results=await db.batch([
    db.prepare('INSERT OR IGNORE INTO native_receipts(id,fingerprint,task_id,result,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM native_tasks WHERE id=? AND version=? AND deleted=0) AND '+grantSql).bind(receiptId,hash,s.task_id,marker,now,s.task_id,row.version,...grantArgs(s)),
    db.prepare('INSERT INTO native_recovery(id,task_id,data,reason,created_at) SELECT ?,id,data,?,? FROM native_tasks WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM native_receipts WHERE id=? AND result=?)').bind(crypto.randomUUID(),'before-anonymous-edit',now,s.task_id,row.version,receiptId,marker),
    db.prepare('UPDATE native_tasks SET data=?,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted=0 AND EXISTS(SELECT 1 FROM native_receipts WHERE id=? AND result=?) AND '+grantSql).bind(JSON.stringify(next),now,s.task_id,row.version,receiptId,marker,...grantArgs(s)),
    db.prepare('INSERT INTO native_outbox(task_id,version,attempts,next_attempt) SELECT id,version,0,0 FROM native_tasks WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM native_receipts WHERE id=? AND result=?) ON CONFLICT(task_id) DO UPDATE SET version=excluded.version,next_attempt=0').bind(s.task_id,row.version+1,receiptId,marker),
  ]);
  if(!results[2].meta.changes){await grant(db,token,true);throw new DataError('CONFLICT','This task changed before your edit was saved. Your draft is kept.',409);}
  for(const id of published)await db.prepare('UPDATE native_share_assets SET uploaded_at=0 WHERE asset_id=?').bind(s.task_id+'|'+id).run();
  return {version:row.version+1};
}
export async function uploadSharedImage(db:D1Database,request:Request,token:string){
  verifyImageOrigin(request);
  const s=await grant(db,token,true);await limitShare(db,s,request.headers.get('x-image-upload')==='chunk'?'chunk':'image');
  const id=request.headers.get('x-image-id')||'';if(!imageId(id))throw new DataError('INVALID','Invalid image.');
  // Server-selected owner and grant generation; no client identity headers.
  const result=await receiveImage(s.owner_id,request,s.token_hash+':'+s.generation);
  if(!result.complete){await grant(db,token,true);return Response.json({ok:true,result:result.result},{headers:{'cache-control':'no-store'}});}
  const mapped=await db.prepare('INSERT OR IGNORE INTO native_share_assets(asset_id,task_id,r2_key,uploaded_at,grant_generation) SELECT ?,?,?,?,? WHERE '+grantSql+' AND EXISTS(SELECT 1 FROM native_tasks WHERE id=? AND deleted=0)').bind(s.task_id+'|'+id.toLowerCase(),s.task_id,imageKey(s.owner_id,id),Date.now(),s.generation,...grantArgs(s),s.task_id).run();
  await grant(db,token,true);
  if(!mapped.meta.changes&&!await db.prepare('SELECT asset_id FROM native_share_assets WHERE asset_id=?').bind(s.task_id+'|'+id.toLowerCase()).first())throw gone();
  return Response.json({ok:true,result:{path:'/api/shared/'+token+'/images/'+id.toLowerCase()}},{headers:{'cache-control':'no-store'}});
}
export async function readSharedImage(db:D1Database,token:string,id:string,origin:string){
  const s=await grant(db,token);if(!imageId(id))throw gone();
  const asset=await db.prepare('SELECT r2_key,uploaded_at,grant_generation FROM native_share_assets WHERE asset_id=? AND task_id=?').bind(s.task_id+'|'+id.toLowerCase(),s.task_id).first<{r2_key:string;uploaded_at:number;grant_generation:number}>();
  if(!asset)throw gone();
  const row=await db.prepare('SELECT data FROM native_tasks WHERE id=? AND deleted=0').bind(s.task_id).first<{data:string}>();
  if(!row)throw gone();
  const referenced=(await imageReferences((JSON.parse(row.data) as Task).detail,origin)).has(id.toLowerCase());
  const pending=s.permission==='edit'&&asset.grant_generation===s.generation&&asset.uploaded_at>Date.now()-600000;
  if(!referenced&&!pending)throw gone();
  if(asset.r2_key!==imageKey(s.owner_id,id))throw gone();
  const object=await getImage(s.owner_id,id);if(!object)throw gone();
  await grant(db,token);
  return new Response(imageBody(object.bytes),{headers:{'content-type':object.type,'cache-control':'private, no-store','cdn-cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','content-security-policy':"default-src 'none'; sandbox"}});
}
