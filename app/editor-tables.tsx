'use client';

import {useLayoutEffect, useRef, useState} from 'react';
import {clipboardTableContent, overlayTableCells} from './editor-table-paste';

export type EditorTable={id:string;header:boolean;rows:string[][]};
export type TableAction='row-add'|'row-remove'|'column-add'|'column-remove'|'header'|'remove';
export const TABLE_MAX_ROWS=50;
export const TABLE_MAX_COLUMNS=8;
export const TABLE_ACTIONS:{id:TableAction;label:string;text:string}[]=[
  {id:'row-add',label:'Add row below',text:'+ Row'},
  {id:'column-add',label:'Add column right',text:'+ Column'},
  {id:'row-remove',label:'Delete current row',text:'− Row'},
  {id:'column-remove',label:'Delete current column',text:'− Column'},
  {id:'header',label:'Toggle header row',text:'Header'},
  {id:'remove',label:'Delete table',text:'×'},
];
export function createEditorTable():EditorTable{return {id:'table-'+crypto.randomUUID(),header:true,rows:Array.from({length:3},()=>['',''])};}
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function tableMarkup(table:EditorTable){
  const rows=table.rows.map((row,r)=>'<tr>'+row.map((value,c)=>{const tag=table.header&&r===0?'th':'td';return '<'+tag+' contenteditable="plaintext-only" tabindex="0" aria-label="Row '+(r+1)+', column '+(c+1)+'">'+(escape(value)||'<br>')+'</'+tag+'>';}).join('')+'</tr>').join('');
  return '<div data-editor-table="'+escape(table.id)+'" data-table-header="'+String(table.header)+'" contenteditable="false"><table style="min-width:'+Math.max(300,table.rows[0].length*150)+'px"><tbody>'+rows+'</tbody></table></div>';
}
export function tableCellText(cell:Element):string{
  const read=(node:Node):string=>{
    if(node.nodeType===3)return node.textContent||'';
    if(!(node instanceof Element))return '';
    if(node.tagName==='BR')return '\n';
    const text=Array.from(node.childNodes).map(read).join('');
    return ['DIV','P'].includes(node.tagName)?text+'\n':text;
  };
  const value=Array.from(cell.childNodes).map(read).join('').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ');
  return cell.innerHTML.toLowerCase()==='<br>'?'':cell.lastChild instanceof Element&&['BR','DIV','P'].includes(cell.lastChild.tagName)?value.replace(/\n$/,''):value;
}
export function readEditorTable(node:Element):EditorTable|null{
  const table=node.tagName==='TABLE'?node:node.querySelector('table');if(!table)return null;
  const source=Array.from(table.querySelectorAll('tr')).filter(row=>row.closest('table')===table);
  const rows:string[][]=[];
  source.forEach((row,r)=>{rows[r]??=[];let column=0;Array.from(row.children).filter(cell=>['TD','TH'].includes(cell.tagName)).forEach(cell=>{
    while(rows[r][column]!==undefined)column++;
    const colspan=Math.max(1,Math.min(100,Number(cell.getAttribute('colspan'))||1));
    const rowspan=Math.max(1,Math.min(source.length-r,Number(cell.getAttribute('rowspan'))||1));
    for(let y=0;y<rowspan;y++){rows[r+y]??=[];for(let x=0;x<colspan;x++)rows[r+y][column+x]=x===0&&y===0?tableCellText(cell):'';}column+=colspan;
  });});
  if(!rows.length||!rows.some(row=>row.length))return null;
  const width=Math.max(...rows.map(row=>row.length));
  // Never truncate an existing document. Limits apply only to adding cells.
  rows.forEach(row=>{for(let c=0;c<width;c++)row[c]??='';});
  const raw=node.getAttribute('data-editor-table')||'';
  const id=/^[a-zA-Z0-9_-]{1,80}$/.test(raw)?raw:'table-import';
  return {id,header:node.getAttribute('data-table-header')==='true'||!!table.querySelector('tr:first-child > th'),rows};
}
export function normalizeTables(root:HTMLElement){
  const used=new Set<string>();
  Array.from(root.querySelectorAll('table')).filter(table=>!table.parentElement?.closest('table')).forEach((node,index)=>{
    const wrapper=node.parentElement?.hasAttribute('data-editor-table')?node.parentElement:node;
    const table=readEditorTable(wrapper);if(!table)return;
    if(table.id==='table-import')table.id+='-'+index;
    while(used.has(table.id))table.id+='x';used.add(table.id);
    const template=root.ownerDocument.createElement('template');template.innerHTML=tableMarkup(table);wrapper.replaceWith(template.content);
  });
}
export function tableActionDisabled(table:EditorTable,action:TableAction){return action==='row-add'?table.rows.length>=TABLE_MAX_ROWS:action==='column-add'?table.rows[0].length>=TABLE_MAX_COLUMNS:action==='row-remove'?table.rows.length<=1:action==='column-remove'?table.rows[0].length<=1:false;}
export function changeTable(table:EditorTable,action:TableAction,row=0,column=0):{table:EditorTable|null;row:number;column:number}{
  row=Math.max(0,Math.min(row,table.rows.length-1));column=Math.max(0,Math.min(column,table.rows[0].length-1));
  if(action==='remove')return {table:null,row,column};
  if(tableActionDisabled(table,action))return {table,row,column};
  const next={...table,rows:table.rows.map(cells=>[...cells])};
  if(action==='row-add'){next.rows.splice(++row,0,Array(next.rows[0].length).fill(''));}
  if(action==='row-remove'){next.rows.splice(row,1);row=Math.min(row,next.rows.length-1);}
  if(action==='column-add'){column++;next.rows.forEach(cells=>cells.splice(column,0,''));}
  if(action==='column-remove'){next.rows.forEach(cells=>cells.splice(column,1));column=Math.min(column,next.rows[0].length-1);}
  if(action==='header')next.header=!next.header;
  return {table:next,row,column};
}
export function tableCell(target:EventTarget|Node|null):HTMLElement|null{
  const element=target instanceof Element?target:target instanceof Node?target.parentElement:null;
  const cell=element?.closest<HTMLElement>('td,th');return cell?.closest('[data-editor-table]')?cell:null;
}
export function tableCellPosition(cell:HTMLElement){const row=cell.parentElement!;return {row:Array.from(row.parentElement!.children).indexOf(row),column:Array.from(row.children).indexOf(cell)};}
export function focusTableCell(wrapper:Element,row=0,column=0){
  const cell=wrapper.querySelectorAll('tr')[row]?.children[column] as HTMLElement|undefined;
  if(!cell)return;cell.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(cell);range.collapse(false);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
}
export function refreshTableControls(root:HTMLElement){
  root.querySelectorAll<HTMLElement>('[data-editor-table]').forEach(wrapper=>{
    if(wrapper.querySelector('[data-table-controls]'))return;
    const table=readEditorTable(wrapper);if(!table)return;
    const controls=document.createElement('div');controls.setAttribute('data-table-controls','');controls.contentEditable='false';
    TABLE_ACTIONS.forEach(action=>{const button=document.createElement('button');button.type='button';button.dataset.tableAction=action.id;button.textContent=action.text;button.title=action.label;button.setAttribute('aria-label',action.label);button.disabled=tableActionDisabled(table,action.id);if(action.id==='header')button.setAttribute('aria-pressed',String(table.header));controls.appendChild(button);});
    wrapper.insertBefore(controls,wrapper.firstChild);
  });
}
export function tableControlMutation(record:MutationRecord){
  const element=record.target instanceof Element?record.target:record.target.parentElement;
  if(element?.closest('[data-table-controls]'))return true;
  return record.type==='childList'&&record.addedNodes.length>0&&Array.from(record.addedNodes).every(node=>node instanceof Element&&node.hasAttribute('data-table-controls'))&&record.removedNodes.length===0;
}
export function tablePlainText(table:EditorTable){return table.rows.map(row=>row.map(cell=>cell.replace(/\n/g,' / ')).join(' | ')).join('\n');}

type MobileProps={table:EditorTable;onBegin:()=>void;onBeforeChange:()=>void;onChange:(table:EditorTable)=>void;onSave:()=>void;onRemove:()=>void;onExit:(before:boolean)=>void;onUndo:(redo:boolean)=>void;onComposition:(active:boolean)=>void};
export function MobileEditorTable(props:MobileProps){
  const {table}=props;const root=useRef<HTMLDivElement>(null);const active=useRef({row:0,column:0});const composing=useRef(false);const [position,setPosition]=useState({row:0,column:0});
  const focus=(row:number,column:number)=>requestAnimationFrame(()=>{const rows=root.current?.querySelectorAll('tr');const target=rows?.[Math.min(row,rows.length-1)];const cells=target?.querySelectorAll('textarea');cells?.[Math.min(column,cells.length-1)]?.focus({preventScroll:true});});

  function action(id:TableAction){
    if(composing.current)return;
    const result=changeTable(table,id,active.current.row,active.current.column);if(result.table===table)return;
    if(!result.table){props.onRemove();return;}props.onBeforeChange();props.onChange(result.table);focus(result.row,result.column);
  }
  return <div ref={root} data-editor-table={table.id} className="mobile-editor-table" onFocusCapture={()=>props.onBegin()} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))props.onSave();}}>
    <div data-table-controls="">{TABLE_ACTIONS.map(item=><button key={item.id} type="button" title={item.label} aria-label={item.label} aria-pressed={item.id==='header'?table.header:undefined} disabled={tableActionDisabled(table,item.id)} onPointerDown={event=>event.preventDefault()} onClick={()=>action(item.id)}>{item.text}</button>)}</div>
    <div className="table-scroll"><table style={{minWidth:Math.max(300,table.rows[0].length*150)}}><tbody>{table.rows.map((cells,r)=><tr key={r}>{cells.map((value,c)=>{const Cell=table.header&&r===0?'th':'td';return <Cell key={c}><TableInput value={value} label={'Row '+(r+1)+', column '+(c+1)} cellKey={r+'-'+c} onFocus={()=>{active.current={row:r,column:c};setPosition(active.current);}} onBeforeInput={()=>{if(!composing.current)props.onBeforeChange();}} onChange={text=>{const rows=table.rows.map(row=>[...row]);rows[r][c]=text;props.onChange({...table,rows});}} onComposition={state=>{if(state)props.onBeforeChange();composing.current=state;props.onComposition(state);}} onPaste={event=>{if(composing.current)return;const content=clipboardTableContent(event.clipboardData);if(!content||content.tables.length!==1)return;event.preventDefault();event.stopPropagation();props.onBeforeChange();props.onChange(overlayTableCells(table,content.tables[0],r,c));focus(r,c);}} onKeyDown={event=>{
      if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;const command=event.ctrlKey||event.metaKey;const key=event.key.toLowerCase();
      if(command&&['z','y'].includes(key)){event.preventDefault();props.onUndo(key==='y'||event.shiftKey);focus(r,c);return;}
      if(event.key==='Escape'||command&&event.key==='Enter'){event.preventDefault();props.onExit(false);return;}
      if(event.key==='Tab'){event.preventDefault();const width=cells.length;const next=r*width+c+(event.shiftKey?-1:1);if(next<0){props.onExit(true);return;}if(next>=table.rows.length*width){if(table.rows.length>=TABLE_MAX_ROWS){props.onExit(false);return;}props.onBeforeChange();props.onChange({...table,rows:[...table.rows,Array(width).fill('')]});}focus(Math.floor(next/width),next%width);}
    }}/></Cell>;})}</tr>)}</tbody></table></div>
    <span className="table-hint">Row {position.row+1}, column {position.column+1} · Tab: next cell · Esc: continue below</span>
  </div>;
}
function TableInput({value,label,cellKey,onFocus,onBeforeInput,onChange,onComposition,onKeyDown,onPaste}:{value:string;label:string;cellKey:string;onFocus:()=>void;onBeforeInput:()=>void;onChange:(text:string)=>void;onComposition:(active:boolean)=>void;onKeyDown:(event:React.KeyboardEvent<HTMLTextAreaElement>)=>void;onPaste:(event:React.ClipboardEvent<HTMLTextAreaElement>)=>void}){
  const input=useRef<HTMLTextAreaElement>(null);const composing=useRef(false);
  const resize=()=>{const node=input.current;if(node){node.style.height='0px';node.style.height=Math.max(30,node.scrollHeight)+'px';}};
  useLayoutEffect(()=>{if(input.current&&!composing.current&&input.current.value!==value)input.current.value=value;resize();},[value]);
  return <textarea ref={input} defaultValue={value} data-table-cell={cellKey} aria-label={label} rows={1} onFocus={onFocus} onInput={event=>{if(!composing.current&&event.currentTarget.value!==value)onBeforeInput();onChange(event.currentTarget.value);resize();}} onKeyDown={onKeyDown} onPaste={onPaste} onCompositionStart={()=>{composing.current=true;onComposition(true);}} onCompositionEnd={event=>{onChange(event.currentTarget.value);composing.current=false;onComposition(false);}}/>;
}
