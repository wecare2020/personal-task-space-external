'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {taskTypeName,type TaskType} from './task-types';
import './task-type-property.css';

export function taskTypeChoices(types:TaskType[],value:string){
 const choices=[{id:'',name:'None'},...types.filter(type=>type.active||type.id===value).map(type=>({id:type.id,name:type.name+(type.active?'':' (hidden)')}))];
 if(value&&!types.some(type=>type.id===value))choices.push({id:value,name:'Unavailable type'});
 return choices;
}

export default function TaskTypeProperty({value='',types,onChange}:{value?:string;types:TaskType[];onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),id=useId();
 const label=taskTypeName(types,value),choices=taskTypeChoices(types,value);
 function close(restore=false){setOpen(false);if(restore)trigger.current?.focus();}
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};document.addEventListener('pointerdown',outside);const frame=requestAnimationFrame(()=>menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());return()=>{document.removeEventListener('pointerdown',outside);cancelAnimationFrame(frame);};},[open]);
 return <div className="property project-property task-type-control" data-task-property="taskType" ref={root} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close(true);}if(!open||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const options=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')||[]),index=options.indexOf(document.activeElement as HTMLButtonElement);options[event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();}}>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 13 11 22 2 13V4h9l9 9Z"/><circle cx="7" cy="9" r="1.5"/></svg>
  <button ref={trigger} type="button" className="project-menu-trigger" aria-label={`Task type: ${label}`} title={`Task type: ${label}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(current=>!current)}><span className="project-menu-value">{value?label:'Task type'}</span><span className={open?'menu-chevron open':'menu-chevron'}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></span></button>
  {open&&<div id={id} ref={menu} className="project-menu task-type-menu" role="menu" aria-label="Task type">{choices.map(choice=><button key={choice.id} type="button" role="menuitemradio" aria-checked={value===choice.id} onClick={()=>{if(value!==choice.id)onChange(choice.id);close(true);}}><span>{choice.name}</span><span aria-hidden="true">{value===choice.id?'✓':''}</span></button>)}<a href="/settings?section=types" role="menuitem">Manage types</a></div>}
 </div>;
}
