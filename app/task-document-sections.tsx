'use client';
import {accountSessionStorage} from './workspace-cache';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {EMPTY_TASK_FORM,parseTaskForm,serializeTaskForm,type TaskFormField} from './task-form-data';
import {DEFAULT_FORM_LAYOUT,recordValues,type TaskFormLayout,type FormField} from './task-form-layout';
import {validateTypeForm} from './task-schema';
import FormFieldInput from './form-field-input';
import TaskRelatedSections from './task-related-sections';
import './task-document-sections.css';

type Tab='brief'|'form'|'discussion';
type Field='taskForm'|'discussion';
const tabs:Array<{id:Tab;label:string}>=[{id:'brief',label:'Brief'},{id:'form',label:'Task Form'},{id:'discussion',label:'Discussion'}];
type Props={taskId:string;taskName?:string;layout?:TaskFormLayout;validationFields?:FormField[];taskForm?:string;discussion?:string;children:ReactNode;onSave:(field:Field,value:string,base:string)=>Promise<boolean>};

// Per-tab session drafts never share a key with another browser tab. Explicit
// Save uses the original field value as CAS, not a freshly refreshed baseline.
export function StoredTaskField({taskId,taskName='',layout=DEFAULT_FORM_LAYOUT,validationFields,field,saved,onSave}:{taskId:string;taskName?:string;layout?:TaskFormLayout;validationFields?:FormField[];field:Field;saved:string;onSave:Props['onSave']}){
 const [draft,setDraft]=useState(saved),[base,setBase]=useState(saved),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const latest=useRef({draft:saved,base:saved}),restored=useRef(false),key=`personal-task-space:section-draft:v1:${taskId}:${field}`;
 useEffect(()=>{try{const raw=accountSessionStorage.getItem(key);if(raw){const item=JSON.parse(raw);if(typeof item.draft==='string'&&typeof item.base==='string'&&item.draft.length<100001){if(field==='taskForm')parseTaskForm(item.draft,false);latest.current={draft:item.draft,base:item.base};setDraft(item.draft);setBase(item.base);if(item.base!==saved)setMessage('The saved version changed. Your draft is kept; Save will check for conflicts.');}}}catch{setMessage('Could not restore this draft.');}restored.current=true;},[key]);
 useEffect(()=>{if(!restored.current)return;if(latest.current.draft===latest.current.base){latest.current={draft:saved,base:saved};setDraft(saved);setBase(saved);}},[saved]);
 const dirty=draft!==base;
 function forgetDraft(expectedDraft:string,expectedBase:string){try{const raw=accountSessionStorage.getItem(key);if(!raw)return;const stored=JSON.parse(raw);if(stored.draft===expectedDraft&&stored.base===expectedBase)accountSessionStorage.removeItem(key);}catch{}}
 function change(value:string){latest.current={draft:value,base};setDraft(value);setMessage('');try{accountSessionStorage.setItem(key,JSON.stringify({draft:value,base}));}catch{setMessage('This browser could not keep a draft. Keep this page open until you save.');}}
 function cancel(){latest.current={draft:saved,base:saved};setDraft(saved);setBase(saved);setMessage('');try{accountSessionStorage.removeItem(key);}catch{}}
 async function save(){if(busy||!dirty)return;const target=draft,original=base;setBusy(true);setMessage('');try{if(field==='taskForm'){const values=parseTaskForm(target);recordValues(values.custom,(validationFields||layout.sections.flatMap(s=>s.fields)).filter(f=>!['goal','outcome','priority','owner','effort','nextStep','reference'].includes(f.id)));validateTypeForm(values,layout);}const ok=await onSave(field,target,original);if(ok){if(latest.current.draft===target){latest.current={draft:target,base:target};setBase(target);forgetDraft(target,original);}setMessage('Saved');}else setMessage('Not confirmed. Your draft is kept; check the sync or recovery notice.');}catch(error){setMessage(error instanceof Error?error.message:'Could not save. Your draft is kept.');}finally{setBusy(false);}}
 let values={...EMPTY_TASK_FORM};if(field==='taskForm'){try{values=parseTaskForm(draft,false);}catch{}}
 function setField(name:string,value:string){try{change(serializeTaskForm(name in EMPTY_TASK_FORM&&name!=='custom'?{...values,[name]:value}:{...values,custom:{...values.custom,[name]:value}},false));}catch(error){setMessage(error instanceof Error?error.message:'Invalid field.');}}
 return <form className="task-section-form" onInvalidCapture={event=>{const section=(event.target as HTMLElement).closest('details');if(section)section.open=true;}} onSubmit={event=>{event.preventDefault();void save();}} aria-label={field==='taskForm'?'Task Form':'Discussion'}>
 <fieldset disabled={busy}>{field==='taskForm'?<>
  <p className="task-current-target">Current task · <strong>{taskName||taskId}</strong></p>
  {layout.sections.filter(s=>s.active).map(section=><details className="task-form-section" key={section.id} open={section.expanded||undefined}><summary>{section.name}<span className="related-section-kind">Task fields</span></summary><div className="task-form-fields task-form-grid">{section.fields.filter(f=>f.active).map(f=><FormFieldInput key={f.id} field={f} value={f.id in EMPTY_TASK_FORM&&f.id!=='custom'?values[f.id as TaskFormField]:values.custom[f.id]||''} onChange={value=>setField(f.id,value)}/>)}</div></details>)}
 </>:<label className="task-form-field discussion-field"><span>Discussion notes</span><textarea aria-label="Discussion notes" value={draft} onChange={event=>change(event.target.value)} rows={9} maxLength={100000} placeholder="Questions, decisions, updates and ideas…"/><small>Private notes for this task — not a public comment thread.</small></label>}</fieldset>
 <div className="task-form-actions"><button type="button" onClick={cancel} disabled={!dirty||busy}>Cancel</button><button type="submit" disabled={!dirty||busy}>{busy?'Saving…':'Save'}</button><span role="status" aria-live="polite">{message|| (dirty?'Unsaved changes':'')}</span></div>
 </form>;
}

export default function TaskDocumentSections({taskId,taskName='',layout=DEFAULT_FORM_LAYOUT,validationFields,taskForm='',discussion='',onSave,children}:Props){
 const [active,setActive]=useState<Tab>('brief'),[visited,setVisited]=useState({form:false,discussion:false});
 const buttons=useRef<Array<HTMLButtonElement|null>>([]);
 function activate(tab:Tab){setActive(tab);if(tab!=='brief')setVisited(current=>({...current,[tab]:true}));}
 return <>
  <div className="task-document-tabs" role="tablist" aria-label="Task sections">{tabs.map((tab,index)=><button ref={node=>{buttons.current[index]=node;}} key={tab.id} type="button" role="tab" id={`task-section-tab-${tab.id}`} aria-controls={`task-section-panel-${tab.id}`} aria-selected={active===tab.id} tabIndex={active===tab.id?0:-1} onClick={()=>activate(tab.id)} onKeyDown={event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();activate(tabs[next].id);buttons.current[next]?.focus();}}>{tab.label}</button>)}</div>
  <div role="tabpanel" id="task-section-panel-brief" aria-labelledby="task-section-tab-brief" hidden={active!=='brief'}>{children}</div>
  <div className="task-form-wrap" role="tabpanel" id="task-section-panel-form" aria-labelledby="task-section-tab-form" hidden={active!=='form'}>{visited.form&&<><StoredTaskField taskId={taskId} taskName={taskName} layout={layout} validationFields={validationFields} field="taskForm" saved={taskForm} onSave={onSave}/><TaskRelatedSections taskId={taskId} tables={layout.tables}/><a className="task-form-configure" href="/settings?section=task-types" onClick={()=>{try{accountSessionStorage.setItem('personal-task-space:settings-return',location.pathname+location.search);}catch{}}}>Configure task type form ↗</a></>}</div>
  <div className="task-form-wrap" role="tabpanel" id="task-section-panel-discussion" aria-labelledby="task-section-tab-discussion" hidden={active!=='discussion'}>{visited.discussion&&<StoredTaskField taskId={taskId} field="discussion" saved={discussion} onSave={onSave}/>}</div>
 </>;
}
