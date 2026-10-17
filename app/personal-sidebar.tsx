'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {signOut} from 'next-auth/react';
import {accountSessionStorage} from './workspace-cache';
export type SidebarView='task'|'project';
export type PersonalAccount={name:string;email:string;ownerId?:string};
export function SidebarTabs({value,onChange}:{value:SidebarView;onChange:(value:SidebarView)=>void}){
 const buttons=useRef<Partial<Record<SidebarView,HTMLButtonElement>>>({});
 return <div className="sidebar-view-tabs" role="tablist" aria-label="Sidebar view">{(['task','project'] as const).map(view=><button key={view} ref={button=>{if(button)buttons.current[view]=button;}} type="button" role="tab" id={`sidebar-tab-${view}`} aria-controls={`sidebar-panel-${view}`} aria-selected={value===view} tabIndex={value===view?0:-1} onClick={()=>onChange(view)} onKeyDown={event=>{const next=event.key==='Home'?'task':event.key==='End'?'project':['ArrowLeft','ArrowRight'].includes(event.key)?value==='task'?'project':'task':null;if(next){event.preventDefault();onChange(next);buttons.current[next]?.focus();}}}>{view==='task'?'Task':'Project'}</button>)}</div>;
}
export function SidebarFooter({account,onRecovery,gearIcon,accountIcon,data,editorChoice}:{editorChoice?:ReactNode;data?:ReactNode;account:PersonalAccount;onRecovery:()=>void;gearIcon:ReactNode;accountIcon:ReactNode}){
 const [menu,setMenu]=useState<'options'|'account'|null>(null),root=useRef<HTMLElement>(null),gear=useRef<HTMLButtonElement>(null),user=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!menu)return;root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setMenu(null);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMenu(null);(menu==='options'?gear:user).current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[menu]);
 return <footer className="personal-sidebar-footer" ref={root}>
  <button ref={gear} type="button" className="sidebar-footer-icon" onClick={()=>setMenu(current=>current==='options'?null:'options')} aria-label="Workspace options" title="Workspace options" aria-haspopup="menu" aria-expanded={menu==='options'}>{gearIcon}</button>
  <button ref={user} type="button" className="sidebar-account-button" onClick={()=>setMenu(current=>current==='account'?null:'account')} aria-label="Account" title={account.email||account.name} aria-haspopup="menu" aria-expanded={menu==='account'}>{accountIcon}<span>{account.name.split(' ')[0]||'Account'}</span></button>
  {menu==='options'&&<div className="sidebar-footer-menu" role="menu" aria-label="Workspace options"><a role="menuitem" href="/settings" onClick={()=>{try{accountSessionStorage.setItem('personal-task-space:settings-return',location.pathname+location.search);}catch{}}}>Settings</a>{editorChoice}<button type="button" role="menuitem" onClick={()=>{setMenu(null);onRecovery();}}>Recovery</button><a role="menuitem" href="/api-access">Task API</a>{data}</div>}
  {menu==='account'&&<div className="sidebar-footer-menu account-menu" role="menu" aria-label="Account"><div className="sidebar-account-info"><strong>{account.name}</strong>{account.email&&<small>{account.email}</small>}</div><button type="button" role="menuitem" onClick={()=>void signOut({redirectTo:'/signin'})}>Sign out</button></div>}
 </footer>;
}
