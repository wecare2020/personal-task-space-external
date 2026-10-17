'use client';
import {workspaceFetch} from './workspace-cache';
import {useEffect,useRef,useState} from 'react';
type Settings={permission:'private'|'view'|'edit';generation:number;url:string|null};
export default function ShareTask({taskId}:{taskId:string}){
  const [open,setOpen]=useState(false),[settings,setSettings]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const serial=useRef(0);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[open]);
  async function request(body?:Record<string,unknown>){
    const sequence=++serial.current;setBusy(true);setMessage('');
    try{const response=await workspaceFetch('/api/shares/'+encodeURIComponent(taskId),{method:body?'POST':'GET',cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
      if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Sign in again to manage sharing.');
      const result=await response.json() as {ok?:boolean;error?:string;result:Settings};if(!response.ok||!result.ok)throw new Error(result.error||'Could not update sharing.');if(sequence===serial.current)setSettings(result.result as Settings);
    }catch(error){if(sequence===serial.current)setMessage(error instanceof Error?error.message:'Could not update sharing.');}finally{if(sequence===serial.current)setBusy(false);}
  }
  function show(){const next=!open;setOpen(next);if(next&&!busy)void request();}
  async function copy(){if(!settings?.url)return;try{await navigator.clipboard.writeText(settings.url);setMessage('Link copied');}catch{setMessage('Select the link below to copy it.');}}
  return <div className="task-share" ref={root}>
    <button ref={trigger} type="button" className="share-trigger" onClick={show} aria-expanded={open} aria-haspopup="dialog">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Share
    </button>
    {open&&<section className="share-popover" role="dialog" aria-label="Share this task" aria-busy={busy}>
      <div className="share-popover-heading"><strong>Share this task</strong><button type="button" onClick={()=>{setOpen(false);trigger.current?.focus();}} aria-label="Close sharing">×</button></div>
      <p>Only this task. No sign-in required.</p>
      <fieldset disabled={busy||!settings}><legend className="visually-hidden">Link access</legend>
        {([['private','Private','Only you can open this task.'],['view','Can view','Anyone with the link can read.'],['edit','Can edit','Anyone with the link can edit the title and notes.']] as const).map(([permission,label,description])=><label key={permission} className="share-option"><input type="radio" name={'share-'+taskId} checked={settings?.permission===permission} onChange={()=>void request({permission,generation:settings?.generation})}/><span><strong>{label}</strong><small>{description}</small></span></label>)}
      </fieldset>
      {settings?.url&&<><div className="share-link-row"><input aria-label="Shared task link" readOnly value={settings.url} onFocus={e=>e.currentTarget.select()}/><button type="button" onClick={()=>void copy()}>Copy link</button></div><p className="share-warning">Recipients can forward this link. Changes also sync to your Sheet.</p><button className="share-reset" disabled={busy} onClick={()=>{if(window.confirm('Replace the link? The old link will stop working.'))void request({permission:settings.permission,generation:settings.generation,rotate:true});}}>Replace link</button></>}
      <div className="share-feedback" role="status">{busy?'Updating…':message}</div>
    </section>}
  </div>;
}
