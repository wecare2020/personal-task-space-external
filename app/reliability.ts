import {accountSessionStorage,accountLocalStorage,workspaceScope} from './workspace-cache';
// Device-local recovery only. Native D1 remains the authoritative store.
export type PendingMutation<T>={requestId:string;id:string;updates:Partial<T>;expectedValues:Partial<T>;baseTask?:T;createdAt:number;undo?:{sequence:number;id:string;previous:Partial<T>;applied:Partial<T>}};
const WRITER_POINTER='personal-task-space:writer:v2';
let writer:string|undefined;
let writerScope='';
let previousWriters:string[]=[];
const absentRecords=new Set<string>();
export function writerIdentity(){
  const scope=workspaceScope();if(scope!==writerScope){writerScope=scope;writer=undefined;previousWriters=[];absentRecords.clear();}
  if(writer)return writer;
  if(typeof window==='undefined')return 'server';
  writer=crypto.randomUUID();
  try{const previous=accountSessionStorage.getItem(WRITER_POINTER);previousWriters=previous?(previous.startsWith('[')?JSON.parse(previous):[previous]):[];accountSessionStorage.setItem(WRITER_POINTER,JSON.stringify([writer,...previousWriters].slice(0,64)));}catch{}
  return writer;
}
function ownedKey(kind:string,id:string,owner=writerIdentity()){return `personal-task-space:${kind}:v2:${owner}:${encodeURIComponent(id)}`;}
function readJson(key:string){try{const raw=accountLocalStorage.getItem(key);return raw?JSON.parse(raw):null;}catch{return null;}}
export function readOwnedRecord<T>(kind:string,id:string,legacyKey?:string):T|null{
  writerIdentity();const own=ownedKey(kind,id);if(absentRecords.has(own))return null;const current=readJson(own);if(current)return current.cleared===true?null:current as T;
  let previous=null;for(const owner of previousWriters){previous=readJson(ownedKey(kind,id,owner));if(previous)break;}
  // Copy on reload/duplicate-tab. Never mutate another document's namespace.
  const legacy=legacyKey?readJson(legacyKey):null;
  const migrationKey=legacyKey?`${legacyKey}:adopted`:'';
  const legacyStamp=legacy?String(legacy.updatedAt):'';
  let adopted='';try{adopted=accountLocalStorage.getItem(migrationKey)||'';}catch{}
  const candidate=previous||((legacy&&adopted!==legacyStamp)?legacy:null);
  if(!candidate){absentRecords.add(own);return null;}
  if(!writeOwnedRecord(kind,id,candidate))return candidate as T;
  if(!previous&&legacy)try{accountLocalStorage.setItem(migrationKey,legacyStamp);}catch{}
  return candidate.cleared===true?null:candidate as T;
}
export function writeOwnedRecord(kind:string,id:string,value:unknown){try{const key=ownedKey(kind,id);absentRecords.delete(key);const raw=JSON.stringify(value);accountLocalStorage.setItem(key,raw);return accountLocalStorage.getItem(key)===raw;}catch{return false;}}
export function clearOwnedRecord(kind:string,id:string,field:string,expected:unknown){
  try{const key=ownedKey(kind,id);const raw=accountLocalStorage.getItem(key);if(!raw)return;const current=JSON.parse(raw);if(current[field]!==expected)return;accountLocalStorage.setItem(key,JSON.stringify({cleared:true,updatedAt:Date.now()}));}catch{}
}
export function archiveRecovery(taskId:string,field:string,localValue:unknown,remoteValue:unknown){
  return writeOwnedRecord('recovery',`${taskId}:${field}:${Date.now()}`,{taskId,field,localValue,remoteValue,savedAt:Date.now()});
}
export function readMutationJournal<T>():PendingMutation<T>[] {const value=readOwnedRecord<PendingMutation<T>[]>('pending-mutations','all');return Array.isArray(value)?value.filter(item=>item&&typeof item.requestId==='string'&&typeof item.id==='string'&&item.updates&&item.expectedValues):[];}
export function writeMutationJournal<T>(value:PendingMutation<T>[]){return writeOwnedRecord('pending-mutations','all',value);}
export function fieldStampMatches(stamps:Record<string,number>,id:string,key:string,stamp:number){return stamps[`${id}:${key}`]===stamp;}
export type RecoveryRecord={key:string;kind:string;at:number;value:unknown};
export function listLocalRecovery():RecoveryRecord[]{
  try{return accountLocalStorage.keys().filter(key=>/^personal-task-space:(recovery|pending-mutations|detail-draft|title-draft):v2:/.test(key)).flatMap(key=>{const value=readJson(key);if(!value||value.cleared||Array.isArray(value)&&!value.length)return [];return [{key,kind:key.split(':')[1],at:Number(value.savedAt??value.updatedAt??value[0]?.createdAt??0),value}];}).sort((a,b)=>b.at-a.at);}catch{return [];}
}
