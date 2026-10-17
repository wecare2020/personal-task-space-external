'use client';
import {accountSessionStorage,workspaceFetch} from './workspace-cache';
import {createAutosaveWindow} from './autosave-window';
import {useCallback,useEffect,useRef,useState} from 'react';
import {RichDetail,type DetailSnapshot} from './task-space';
type Document={title:string;detail:string};
type Shared=Document&{version:number;permission:'view'|'edit'};
type Pending=Document&{version:number;requestId:string};
class SharedError extends Error{constructor(message:string,readonly status:number){super(message);}}
export default function SharedTask({token}:{token:string}){
  const autosaveClock=useRef(createAutosaveWindow());
  const [recoveryUnavailable,setRecoveryUnavailable]=useState(false);
  const [session,setSession]=useState({dirty:false,saving:false,blocked:false});
  const [data,setData]=useState<Shared|null>(null),[error,setError]=useState(''),[status,setStatus]=useState(''),[generation,setGeneration]=useState(0),[review,setReview]=useState<Shared|null>(null);
  const epoch=useRef(0),reviewPriorBlocked=useRef(false);
  const current=useRef<Document>({title:'',detail:''}),saved=useRef<Document>({title:'',detail:''}),version=useRef(0),permission=useRef('view'),dirty=useRef(false),blocked=useRef(false),inflight=useRef(false),pending=useRef<Pending|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),snapshot=useRef<DetailSnapshot|null>(null),mounted=useRef(true),title=useRef<HTMLTextAreaElement>(null);
  const endpoint='/api/shared/'+encodeURIComponent(token),draftKey='shared-task-draft:v1:'+token;
  const persist=useCallback(()=>{if(mounted.current)setSession({dirty:dirty.current||!!pending.current,saving:inflight.current,blocked:blocked.current});try{if(dirty.current||pending.current||inflight.current)accountSessionStorage.setItem(draftKey,JSON.stringify({...current.current,version:version.current,pending:pending.current}));else accountSessionStorage.removeItem(draftKey);}catch{if(mounted.current)setRecoveryUnavailable(true);}},[draftKey]);
  async function api(body?:Pending):Promise<Shared|{version:number}>{
    const response=await workspaceFetch(endpoint,{method:body?'POST':'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify({...body,editorSchema:8}):undefined,signal:AbortSignal.timeout(25000)});
    if(!response.headers.get('content-type')?.includes('application/json'))throw new SharedError('Could not reach shared storage. Your draft is kept.',503);
    const value=await response.json() as {ok?:boolean;error?:string;result:Shared|{version:number}};if(!response.ok||!value.ok)throw new SharedError(value.error||'This shared task is unavailable.',response.status);return value.result;
  }
  async function flush(){
    autosaveClock.current.reset('shared');
    if(inflight.current||blocked.current||permission.current!=='edit'||!dirty.current)return;
    if(!current.current.title.trim()){setStatus('Add a title to save.');return;}
    inflight.current=true;pending.current??={...current.current,version:version.current,requestId:crypto.randomUUID()};const sending=pending.current;persist();setStatus('Saving…');
    try{const result=await api(sending);if(!mounted.current)return;version.current=result.version;saved.current={title:sending.title,detail:sending.detail};pending.current=null;dirty.current=current.current.title!==saved.current.title||current.current.detail!==saved.current.detail;persist();if(mounted.current)setStatus(dirty.current?'Unsaved changes':'Saved');}
    catch(reason){if(!mounted.current)return;if(reason instanceof SharedError&&[403,404,409].includes(reason.status))blocked.current=true;if(mounted.current)setStatus(reason instanceof Error?reason.message:'Could not save. Your draft is kept.');}
    finally{inflight.current=false;if(mounted.current)persist();if(dirty.current&&!pending.current&&!blocked.current&&mounted.current)timer.current=setTimeout(()=>void flush(),autosaveClock.current.delay('shared'));}
  }
  function stage(patch:Partial<Document>,soon=false){if(!mounted.current)return;current.current={...current.current,...patch};dirty.current=current.current.title!==saved.current.title||current.current.detail!==saved.current.detail;persist();if(timer.current)clearTimeout(timer.current);if(dirty.current){setStatus('Unsaved changes');timer.current=setTimeout(()=>void flush(),soon?50:autosaveClock.current.delay('shared'));}else autosaveClock.current.reset('shared');setData(previous=>previous?{...previous,...patch}:previous);}
  function snapshotDraft(){const html=snapshot.current?.(true);if(html!==undefined&&(dirty.current||pending.current||inflight.current))current.current.detail=html;persist();}
  useEffect(()=>{
    mounted.current=true;let cancelled=false;
    void api().then(result=>{
      if(cancelled)return;const doc=result as Shared;version.current=doc.version;permission.current=doc.permission;current.current={title:doc.title,detail:doc.detail};saved.current={...current.current};setData(doc);
      try{const raw=accountSessionStorage.getItem(draftKey);if(raw&&doc.permission==='edit'){const draft=JSON.parse(raw);if(typeof draft.title==='string'&&typeof draft.detail==='string'){current.current={title:draft.title,detail:draft.detail};dirty.current=true;pending.current=draft.pending||null;setData({...doc,...current.current});if(pending.current)version.current=draft.version;blocked.current=!pending.current&&draft.version!==doc.version;persist();setStatus(blocked.current?'A newer version exists. Your recovered draft is kept — review it before saving.':'Recovered your unsaved draft. Click Retry save when ready.');}}}catch{}
    }).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'This shared task is unavailable.');});
    const leave=(event:BeforeUnloadEvent)=>{snapshotDraft();if(dirty.current||inflight.current){event.preventDefault();event.returnValue='';}};
    const hide=()=>snapshotDraft();
    const visibility=()=>{if(document.visibilityState==='hidden')snapshotDraft();};
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('beforeunload',leave);window.addEventListener('pagehide',hide);
    return()=>{cancelled=true;mounted.current=false;if(timer.current)clearTimeout(timer.current);snapshotDraft();window.removeEventListener('beforeunload',leave);window.removeEventListener('pagehide',hide);document.removeEventListener('visibilitychange',visibility);};
    // One isolated editing session per capability URL. Owner workspace hooks are never mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token]);
  useEffect(()=>{const input=title.current;if(input){input.style.height='auto';input.style.height=input.scrollHeight+'px';}},[data?.title,generation]);
  async function reviewLatest(){if(inflight.current){setStatus('Finishing the current save — try again in a moment.');return;}snapshotDraft();reviewPriorBlocked.current=blocked.current;blocked.current=true;persist();try{const latest=await api() as Shared;permission.current=latest.permission;setReview(latest);if(latest.permission!=='edit')setStatus('This link is now view-only. Copy your draft before leaving.');}catch(reason){setStatus(reason instanceof Error?reason.message:'Unable to load the latest version.');}}
  function adoptLatest(){
    if(!review||inflight.current)return;epoch.current+=1;if(timer.current)clearTimeout(timer.current);try{accountSessionStorage.setItem(draftKey+':recovery:'+Date.now(),JSON.stringify(current.current));}catch{}
    current.current={title:review.title,detail:review.detail};saved.current={...current.current};version.current=review.version;permission.current=review.permission;dirty.current=false;pending.current=null;blocked.current=false;setData(review);setReview(null);setGeneration(epoch.current);persist();setStatus('Latest version loaded. Your previous draft is kept in this tab.');
  }
  function useDraft(){if(!review||review.permission!=='edit'||inflight.current)return;version.current=review.version;pending.current=null;blocked.current=false;setReview(null);persist();void flush();}
  async function copyDraft(){snapshotDraft();try{await navigator.clipboard.writeText(current.current.title+'\n\n'+current.current.detail);setStatus('Draft copied (including rich-text HTML).');}catch{setStatus('Copy failed. Your draft remains in this tab.');}}
  if(error)return <main className="shared-unavailable"><h1>Shared task unavailable</h1><p>{error}</p></main>;
  if(!data)return <main className="shared-unavailable" role="status">Opening shared task…</main>;
  return <main className="shared-task">
    <header className="shared-topbar"><span>Shared task</span><span>{data.permission==='edit'?'Can edit':'View only'} <button className="share-reset" onClick={()=>void reviewLatest()}>Refresh</button></span></header>
    <div className="shared-title">{data.permission==='edit'?<textarea ref={title} aria-label="Task title" className="title-input" rows={1} value={data.title} onChange={e=>stage({title:e.target.value})} onBlur={()=>void flush()}/>:<h1 className="title-input">{data.title}</h1>}</div>
    <div className="content-wrap">{data.permission==='edit'?<RichDetail key={generation} html={data.detail} onDirty={()=>{if(generation===epoch.current)dirty.current=true;}} onDraft={detail=>{if(generation===epoch.current)stage({detail});}} onSave={detail=>{if(generation===epoch.current)stage({detail},true);}} snapshotRef={snapshot} imageEndpoint={endpoint+'/images'}/>:<article className="task-content desktop-rich-document shared-readonly" dangerouslySetInnerHTML={{__html:data.detail}}/>}</div>
    {data.permission==='edit'&&<div className="shared-savebar"><span role="status">{recoveryUnavailable?'Local recovery is unavailable. Keep this tab open until saved. '+status:status||'Changes save automatically'}</span>{session.dirty&&!session.saving&&<><button onClick={()=>void flush()} disabled={session.blocked}>Retry save</button><button onClick={()=>void reviewLatest()}>Review latest</button><button onClick={()=>void copyDraft()}>Copy my draft</button></>}</div>}
    {review&&<div className="link-dialog-backdrop"><section className="shared-review" role="dialog" aria-modal="true" aria-label="Review latest version"><h2>Latest saved version</h2><p>Your draft is still in the editor. Compare it with the version below.</p><h3>{review.title}</h3><article className="task-content desktop-rich-document" dangerouslySetInnerHTML={{__html:review.detail}}/><div className="link-dialog-actions"><button onClick={()=>{setReview(null);blocked.current=reviewPriorBlocked.current;persist();}}>Keep my draft</button><button onClick={adoptLatest}>Load latest</button>{review.permission==='edit'&&<button onClick={useDraft}>Save my draft instead</button>}</div></section></div>}
  </main>;
}
