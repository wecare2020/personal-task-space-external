'use client';
import {useEffect,useRef,useState} from 'react';
import {workspaceFetch} from './workspace-cache';
export default function SheetBackup({menuItem=false}:{menuItem?:boolean}={}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const esc=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',esc);};},[open]);
 async function download(){setBusy(true);setError('');try{const response=await workspaceFetch('/api/workspace/export',{cache:'no-store'});if(!response.ok)throw Error('Could not download your backup.');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='personal-task-space-backup.json';link.click();URL.revokeObjectURL(url);}catch(reason){setError(reason instanceof Error?reason.message:'Backup is unavailable.');}finally{setBusy(false);}}
 return <div className={menuItem?'native-sync backup-menu-item':'native-sync'} ref={root}>
  <button ref={trigger} role={menuItem?'menuitem':undefined} className={menuItem?'backup-menu-trigger':'icon-button toolbar-sheet-link'} aria-label="Data / GitHub backup" title="Private GitHub storage" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 3h7v7M21 3l-9 9M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/></svg>{menuItem&&<span>Data / Backup</span>}
  </button>
  {open&&<section className="native-sync-menu" role="dialog" aria-label="Private workspace data" style={menuItem?{position:'fixed',left:20,bottom:76,width:Math.min(360,window.innerWidth-40),maxHeight:'70dvh',overflowY:'auto'}:undefined}>
   <strong>Private GitHub storage</strong><p>Your workspace is stored separately from app code. Local drafts are kept immediately; remote autosave is grouped.</p>
   <button type="button" disabled={busy} onClick={()=>void download()}>{busy?'Preparing…':'Download backup'}</button>{error&&<p role="alert">{error}</p>}
  </section>}
 </div>;
}
