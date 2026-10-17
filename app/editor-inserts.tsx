'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {nativeImagePath} from './image-files';

export type InsertKind='p'|'h1'|'h2'|'h3'|'ul'|'ol'|'todo'|'blockquote'|'toggle'|'divider'|'image'|'video'|'callout'|'columns2'|'columns3'|'emoji'|'table'|'tree';
export type EditorMedia={kind:'image'|'video';url:string;width?:number};
export function photoWidth(value:unknown){const width=Number(value);return Number.isFinite(width)&&width>=80&&width<=2400?Math.round(width):undefined;}
const COMMANDS:{id:InsertKind;label:string;hint:string;icon:string;keywords:string}[]=[
  {id:'p',label:'Text',hint:'Plain paragraph',icon:'T',keywords:'text paragraph normal van ban'},
  {id:'emoji',label:'Emoji',hint:'Choose an emoji',icon:'🙂',keywords:'emoji icon smile bieu tuong'},
  {id:'h1',label:'Header 1',hint:'Large heading',icon:'H₁',keywords:'header heading title h1 tieu de'},
  {id:'h2',label:'Header 2',hint:'Medium heading',icon:'H₂',keywords:'header heading title h2 tieu de'},
  {id:'h3',label:'Header 3',hint:'Small heading',icon:'H₃',keywords:'header heading title h3 tieu de'},
 {id:'todo',label:'To-do list',hint:'Check off a to-do',icon:'☑',keywords:'todo to do checkbox checklist task viec can lam'},
 {id:'ul',label:'Bullet list',hint:'A simple bulleted list',icon:'•',keywords:'bullet list unordered danh sach'},
  {id:'ol',label:'Numbered list',hint:'Numbered steps',icon:'1.',keywords:'number ordered list so'},
  {id:'blockquote',label:'Quote',hint:'Highlight a quotation',icon:'“',keywords:'quote trich dan'},
  {id:'callout',label:'Callout',hint:'A note that stands out',icon:'💡',keywords:'callout call out note highlight ghi chu'},
  {id:'table',label:'Table',hint:'Simple rows and columns',icon:'▦',keywords:'table bang rows cells'},
  {id:'tree',label:'Editable tree',hint:'Parent / child rows · drag to organize',icon:'⑂',keywords:'tree builder editable hierarchy structure parent child cay cau truc'},
  {id:'columns2',label:'2 columns',hint:'Two sections side by side',icon:'Ⅱ',keywords:'columns2 2 columns column cot'},
  {id:'columns3',label:'3 columns',hint:'Three sections side by side',icon:'Ⅲ',keywords:'columns3 3 columns column cot'},
  {id:'toggle',label:'Toggle',hint:'An expandable section',icon:'▸',keywords:'toggle collapse expand thu gon'},
  {id:'divider',label:'Divider',hint:'A horizontal line',icon:'—',keywords:'divider line horizontal phan vung ngang'},
  {id:'image',label:'Photo',hint:'Embed an image from a link',icon:'▧',keywords:'photo image picture anh'},
  {id:'video',label:'Video',hint:'YouTube, Vimeo or a video link',icon:'▷',keywords:'video youtube vimeo'},
];
export function slashQuery(text:string,start:number,end=start){
  if(start!==end||start!==text.length)return null;
  const match=/^[\t \u00a0]*\/([^/\n\r:]{0,32})$/.exec(text);
  return match?match[1].toLowerCase():null;
}
export function matchingInsertCommands(query:string){const q=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();const words=(item:typeof COMMANDS[number])=>(item.label+' '+item.keywords).toLowerCase();return COMMANDS.filter(item=>words(item).includes(q)).sort((a,b)=>Number(words(b).split(' ').includes(q))-Number(words(a).split(' ').includes(q)));}
export function editorMediaUrl(kind:EditorMedia['kind'],value:string):EditorMedia|null{
  try{const url=new URL(value.trim());const localImage=kind==='image'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&nativeImagePath(url.pathname)&&!url.search&&!url.hash;if((url.protocol!=='https:'&&!localImage)||!url.hostname||url.username||url.password||value.length>4096)return null;
    if(kind==='image')return {kind,url:url.href};
    const host=url.hostname.toLowerCase();let id='';
    if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host))id=url.pathname==='/watch'?url.searchParams.get('v')||'':/^\/(?:embed|shorts)\/([^/]+)\/?$/.exec(url.pathname)?.[1]||'';
    if(host==='youtu.be')id=url.pathname.slice(1);
    if(/^[\w-]{11}$/.test(id))return {kind,url:`https://www.youtube-nocookie.com/embed/${id}`};
    if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){const video=/^\/(?:video\/)?(\d{1,12})\/?$/.exec(url.pathname)?.[1];if(video)return {kind,url:`https://player.vimeo.com/video/${video}`};}
    if(/\.(mp4|webm|ogv|ogg)$/i.test(url.pathname))return {kind,url:url.href};
    return null;
  }catch{return null;}
}
const escapeAttribute=(value:string)=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function readEditorMedia(figure:Element):EditorMedia|null{const kind=figure.getAttribute('data-editor-media');if(kind!=='image'&&kind!=='video')return null;const media=editorMediaUrl(kind,figure.querySelector('img,video,iframe')?.getAttribute('src')||'');return media?{...media,...(kind==='image'?{width:photoWidth(figure.getAttribute('data-editor-width'))}:{})}:null;}
export function mediaMarkup(media:EditorMedia){
  const safe=editorMediaUrl(media.kind,media.url);if(!safe)return '';
  const src=escapeAttribute(safe.url);const embedded=/^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(safe.url);
  const content=safe.kind==='image'?`<img src="${src}" alt="Photo" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:embedded?`<iframe src="${src}" title="Embedded video" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`:`<video src="${src}" controls preload="none"></video>`;
  const openUrl=safe.url.replace('https://www.youtube-nocookie.com/embed/','https://www.youtube.com/watch?v=').replace('https://player.vimeo.com/video/','https://vimeo.com/');
  const width=safe.kind==='image'?photoWidth(media.width):undefined;
  return safe.kind==='image'?`<figure data-editor-media="image"${width?` data-editor-width="${width}" style="width:${width}px"`:''} contenteditable="false"><a href="${src}" target="_blank" rel="noopener noreferrer" aria-label="Open photo">${content}</a></figure>`:`<figure data-editor-media="video" contenteditable="false">${content}<a href="${escapeAttribute(openUrl)}" target="_blank" rel="noopener noreferrer">Open video</a></figure>`;
}
type MenuState={query:string;x:number;y:number;bottom:number;allowToggle:boolean;allowLayouts:boolean};
export function useSlashMenu(onChoose:(kind:InsertKind)=>void){
  const [state,setState]=useState<MenuState|null>(null);const [index,setIndex]=useState(0);const live=useRef(state);live.current=state;const id=useId();
  const close=()=>{live.current=null;setState(null);};
  const update=(query:string|null,rect?:DOMRect,allowToggle=true,allowLayouts=true)=>{if(query===null){if(live.current)close();return;}if(!rect)return;if(live.current?.query!==query)setIndex(0);const next={query,x:rect.left,y:rect.top,bottom:rect.bottom,allowToggle,allowLayouts};live.current=next;setState(next);};
  const choose=(kind:InsertKind)=>{close();onChoose(kind);};
  const keyDown=(event:React.KeyboardEvent)=>{if(!live.current)return false;const items=matchingInsertCommands(live.current.query).filter(item=>(live.current?.allowToggle||item.id!=='toggle')&&(live.current?.allowLayouts||!['callout','columns2','columns3'].includes(item.id)));if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return true;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setIndex(current=>items.length?(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length:0);return true;}if(event.key==='Enter'&&items.length){event.preventDefault();event.stopPropagation();choose(items[Math.min(index,items.length-1)].id);return true;}if(event.key==='Tab')close();return false;};
  const node=state?<SlashMenu id={id} state={state} index={index} choose={choose} close={close}/>:null;
  const accept=()=>{if(!live.current)return false;const items=matchingInsertCommands(live.current.query).filter(item=>(live.current?.allowToggle||item.id!=='toggle')&&(live.current?.allowLayouts||!['callout','columns2','columns3'].includes(item.id)));if(!items.length)return false;choose(items[Math.min(index,items.length-1)].id);return true;};
  return {update,close,keyDown,accept,node,open:!!state,id,activeId:state?`${id}-${index}`:undefined};
}
function SlashMenu({id,state,index,choose,close}:{id:string;state:MenuState;index:number;choose:(kind:InsertKind)=>void;close:()=>void}){
  const root=useRef<HTMLDivElement>(null);const items=matchingInsertCommands(state.query).filter(item=>(state.allowToggle||item.id!=='toggle')&&(state.allowLayouts||!['callout','columns2','columns3'].includes(item.id)));const view=window.visualViewport;const left=Math.max(8,Math.min(state.x,(view?.width||window.innerWidth)-282));const topEdge=view?.offsetTop||0;const bottomEdge=topEdge+(view?.height||window.innerHeight);const below=bottomEdge-state.bottom-12;const above=state.y-topEdge-12;const useAbove=below<220&&above>below;const height=Math.max(100,Math.min(340,useAbove?above:below));
  useEffect(()=>{root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[index]);
  useEffect(()=>{const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};const hide=(event:Event)=>{if(event.target instanceof Node&&root.current?.contains(event.target))return;close();};document.addEventListener('pointerdown',outside);window.addEventListener('resize',hide);window.addEventListener('scroll',hide,true);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',hide);window.removeEventListener('scroll',hide,true);};},[]);
  return createPortal(<div ref={root} className="slash-menu" role="listbox" id={id} aria-label="Insert format" style={{left,top:useAbove?Math.max(topEdge+8,state.y-height-6):state.bottom+6,maxHeight:height}} onPointerDown={event=>event.preventDefault()}><div className="slash-menu-caption">Insert</div>{items.length?items.map((item,i)=><button key={item.id} id={`${id}-${i}`} type="button" role="option" aria-selected={i===index} className="slash-option" onClick={()=>choose(item.id)}><span className="slash-option-icon" aria-hidden="true">{item.icon}</span><span><span className="slash-option-label">{item.label}</span><small>{item.hint}</small></span></button>):<div className="slash-empty">No matching format</div>}</div>,document.body);
}
export function MediaInsertDialog({kind,onApply,onCancel}:{kind:EditorMedia['kind'];onApply:(media:EditorMedia)=>void;onCancel:()=>void}){
  const [value,setValue]=useState('');const [error,setError]=useState('');const root=useRef<HTMLFormElement>(null);const id=useId();
  useEffect(()=>{root.current?.querySelector('input')?.focus();},[]);
  return createPortal(<div className="link-dialog-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onCancel();}}><form ref={root} className="link-dialog" role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onCancel();}if(event.key==='Tab'){const nodes=Array.from(root.current?.querySelectorAll<HTMLElement>('input,button')||[]);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}} onSubmit={event=>{event.preventDefault();const media=editorMediaUrl(kind,value);if(media)onApply(media);else setError(kind==='image'?'Use a full HTTPS image link.':'Use a YouTube, Vimeo, MP4 or WebM HTTPS link.');}}><div className="link-dialog-title" id={id}>Insert {kind==='image'?'photo':'video'}</div><label className="link-dialog-label" htmlFor={`${id}-url`}>Link</label><input id={`${id}-url`} className="link-dialog-input" value={value} onChange={event=>{setValue(event.target.value);setError('');}} placeholder="https://…" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}/><p className="media-insert-hint">{kind==='image'?'Paste a direct image link.':'YouTube, Vimeo, or a direct video link.'}</p>{error&&<div role="alert" className="link-dialog-error">{error}</div>}<div className="link-dialog-actions"><button className="link-dialog-cancel" type="button" onClick={onCancel}>Cancel</button><button className="link-dialog-apply" type="submit">Insert</button></div></form></div>,document.body);
}
