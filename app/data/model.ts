import {parseTaskForm,serializeTaskForm} from '../task-form-data';
export type Task = {id:string;title:string;date:string;completed:boolean;status:'today'|'upcoming'|'later';isTop:boolean;team:boolean;detail:string;projectId:string;projectIds:string[];taskType?:string;taskForm?:string;discussion?:string};
export type Project = {id:string;name:string;color?:string};
export type TaskRow = {id:string;data:string;version:number;baseline:string|null;sync_revision:number;deleted:number;updated_at:number};
export const groups = [['title'],['detail'],['date'],['completed'],['status','isTop'],['team'],['projectId','projectIds'],['taskType'],['taskForm'],['discussion']] as const;
export const keys = groups.flat() as (keyof Task)[];
export class DataError extends Error {
  constructor(public code:string,message:string,public status=400,public currentTask?:Task,public fields:string[]=[]){super(message);}
}
export function projectNames(value:unknown):string[]{const values=Array.isArray(value)?value:String(value||'').split(/[,\n]+/);const seen=new Set<string>();return values.map(v=>String(v).replace(/\s+/g,' ').trim()).filter(v=>{if(!v||seen.has(v.toLowerCase()))return false;seen.add(v.toLowerCase());return true;});}
export function comparable(key:string,value:unknown):string {if(['taskType','taskForm','discussion'].includes(key))return String(value??'');if(key==='date')return String(value||'').slice(0,10);if(key==='projectId'||key==='projectIds')return JSON.stringify(projectNames(value).sort());return JSON.stringify(value)??'null';}
export function same(a:Task|null,b:Task|null):boolean {return a===b||!!a&&!!b&&keys.every(k=>comparable(k,a[k])===comparable(k,b[k]));}
export function normalizeTask(value:Partial<Task>,current?:Task):Task {
  const p=projectNames(value.projectIds??value.projectId??current?.projectIds??[]);
  const next:Task={id:String(value.id??current?.id??''),title:String(value.title??current?.title??'Untitled Task'),detail:String(value.detail??current?.detail??''),date:String(value.date??current?.date??''),completed:value.completed??current?.completed??false,status:value.status??current?.status??'today',isTop:value.isTop??(value.status?false:current?.isTop??false),team:value.team??current?.team??false,projectId:p.join(', '),projectIds:p};
  if('taskType' in value||current&&'taskType' in current){const type=value.taskType??current?.taskType??'';if(type!==''&&!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(type)||'taskType' in value&&typeof value.taskType!=='string')throw new DataError('INVALID','Invalid task type.');next.taskType=type;}
  for(const key of ['taskForm','discussion'] as const){if(key in value||current&&key in current){const text=value[key]??current?.[key]??'';if(key in value&&typeof value[key]!=='string'||typeof text!=='string'||text.length>(key==='taskForm'?50000:100000))throw new DataError('INVALID','Invalid task section.');try{next[key]=key==='taskForm'?serializeTaskForm(parseTaskForm(text)):text;}catch{throw new DataError('INVALID','Invalid task form.');}}}
  next.title=next.title.trim();
  if(!next.id||next.id.length>150||!next.title||next.title.length>2000||next.detail.length>1000000||!['today','upcoming','later'].includes(next.status)||['completed','isTop','team'].some(k=>typeof next[k as keyof Task]!=='boolean')||next.date&&Number.isNaN(Date.parse(next.date)))throw new DataError('INVALID','Invalid task data.');
  return next;
}
export function patchFields(patch:Record<string,unknown>):string[]{const changed=Object.keys(patch);if(!changed.length||changed.some(k=>!keys.includes(k as keyof Task)))throw new DataError('INVALID','Invalid task update.');return groups.filter(g=>g.some(k=>changed.includes(k))).flat();}
export function checkEditor(current:Task,patch:Partial<Task>,schema:unknown){const html=current.detail+(patch.detail||'');if('detail' in patch&&((![3,4,5,6,7,8].includes(Number(schema))&&/<(?:details|figure|hr)\b/i.test(html))||(![4,5,6,7,8].includes(Number(schema))&&/\bdata-editor-(?:callout|columns|column)\s*=/i.test(html))||(![5,6,7,8].includes(Number(schema))&&/\bdata-editor-todo\s*=/i.test(html))||(![6,7,8].includes(Number(schema))&&/<table\b|\bdata-editor-table\s*=/i.test(html))||(![7,8].includes(Number(schema))&&/\bdata-editor-tree\s*=/i.test(html))||(Number(schema)!==8&&/\bdata-blocknote-document\s*=/i.test(html))))throw new DataError('CLIENT_UPDATE_REQUIRED','Reload before editing these note formats.',428);}
export async function fingerprint(value:unknown){const bytes=new TextEncoder().encode(JSON.stringify(value));const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
export function checkFormClient(current:Task|undefined,patch:Partial<Task>,schema:unknown){if(!('taskForm' in patch)||schema===2)return;for(const value of [current?.taskForm,patch.taskForm]){try{if(value&&Object.keys(JSON.parse(value).custom||{}).length)throw new DataError('CLIENT_UPDATE_REQUIRED','Reload before editing custom task fields.',428);}catch(e){if(e instanceof DataError)throw e;}}}
export function sortedObject(value:Record<string,unknown>){return Object.keys(value).sort().map(k=>[k,value[k]]);}
