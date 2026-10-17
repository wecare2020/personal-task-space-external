import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RichDetail,type DetailSnapshot} from '../app/task-space';
import {SidebarFooter} from '../app/personal-sidebar';
import {DEFAULT_TASK_PREFERENCES,type PreferencesRecord,type TextEditorKind} from '../app/task-preferences';
import {importCustomerNote,noteEnvelope,readNoteEnvelope,validNoteBlocks} from '../app/blocknote-document';
import '../app/globals.css';
const initial='<p data-editor-compact="true">Editor test</p><ul><li>First item</li><li>Second item</li></ul><p data-editor-compact="true"><br></p><p data-editor-compact="true"><br></p><p data-editor-todo="false">Check me</p>';
let preferences:PreferencesRecord=JSON.parse(sessionStorage.getItem('qa:preferences')||'null')||{revision:0,preferences:DEFAULT_TASK_PREFERENCES};
let failSettings=false;
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 if(String(input)!=='/api/settings')return nativeFetch(input,init);
 if(init?.method==='POST'){
  if(failSettings)return Response.json({ok:false,error:'Simulated settings failure'},{status:503});
  const next=JSON.parse(String(init.body));if(next.revision!==preferences.revision)return Response.json({ok:false,error:'Settings conflict'},{status:409});
  preferences={revision:preferences.revision+1,preferences:next.preferences};sessionStorage.setItem('qa:preferences',JSON.stringify(preferences));
 }
 return Response.json({ok:true,result:preferences});
};
function Preview(){
 const [html,setHtml]=useState(sessionStorage.getItem('qa:note')||initial),[kind,setKind]=useState<TextEditorKind>(preferences.preferences.textEditor),[generation,setGeneration]=useState(0),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[hold,setHold]=useState(false),[writes,setWrites]=useState(0);
 const snapshot=useRef<DetailSnapshot|null>(null),saved=useRef(html);
 const stage=(value:string)=>{setHtml(value);if(hold)return;sessionStorage.setItem('qa:note',value);saved.current=value;setWrites(n=>n+1);setDirty(false);};
 (window as unknown as {__noteQA:unknown}).__noteQA={snapshot:()=>snapshot.current?.(),saved:()=>saved.current,kind:()=>kind,writes:()=>writes,failSettings:(value:boolean)=>{failSettings=value;},bridge:{importCustomerNote,noteEnvelope,readNoteEnvelope,validNoteBlocks}};
 return <main className="app-shell"><aside className="sidebar"><div className="sidebar-view-tabs"><button aria-selected="true">Task</button><button>Project</button></div><p style={{fontSize:12,color:'#91a0b2'}}>Synthetic editor QA</p><button onClick={()=>{const value=initial;setHtml(value);saved.current=value;sessionStorage.setItem('qa:note',value);setDirty(false);setGeneration(n=>n+1);}}>Plain fixture</button><button onClick={()=>{const value='<details data-editor-toggle="legacy"><summary>Legacy toggle</summary><p>Keep this body</p></details><p><br></p><p><br></p>';setHtml(value);saved.current=value;setDirty(false);setGeneration(n=>n+1);}}>Legacy fixture</button><label><input type="checkbox" checked={hold} onChange={e=>setHold(e.target.checked)}/>Hold saves</label><div style={{flex:1}}/><SidebarFooter account={{name:'QA',email:'qa@example.test'}} gearIcon="⚙" accountIcon="○" onRecovery={()=>{}}/></aside><section className="detail"><header className="detail-header"><div className="detail-inner"><h1>Editor preview</h1><span role="status">{dirty?'Unsaved changes':'Saved'} · {kind} · writes: {writes}</span></div></header><div className="content-wrap" inert={busy||undefined}><RichDetail key={generation+kind} html={html} onDirty={()=>setDirty(true)} onDraft={stage} onSave={stage} snapshotRef={snapshot}/></div></section></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
