'use client';

import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

const SHORTCUTS: Record<string, string> = {
  ':D':'😃', ':-D':'😃', '=D':'😃', ':)':'🙂', ':-)':'🙂',
  ';)':'😉', ';-)':'😉', ':P':'😛', ':p':'😛', ':-P':'😛',
  ':(':'🙁', ':-(':'🙁', ':O':'😮', ':o':'😮', ':-O':'😮', '<3':'❤️',
};
export function emojiShortcut(value:string,start:number,end=start){
  if(start!==end)return null;
  const match=/(?:^|[\s\u00a0])(:-?[D)Pp(Oo]|;-?\)|=D|<3)[ \u00a0]$/.exec(value.slice(0,start));
  if(!match||!SHORTCUTS[match[1]])return null;
  return {start:start-match[1].length-1,end:start,suggested:SHORTCUTS[match[1]]};
}
export function isEmojiSpaceInput(event:Pick<InputEvent,'inputType'|'data'|'isComposing'>){
  return !event.isComposing&&event.inputType==='insertText'&&event.data===' ';
}

// A shared UTF-16 text map keeps rich text ranges aligned across marks and BRs.
// Runtime checkbox controls are deliberately not part of the editable text.
export function emojiTextMap(root:HTMLElement,caret:Range){
  const parts:{node:Node;start:number;end:number}[]=[];let text='';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{
    acceptNode(node){
      if(node instanceof Element&&node.getAttribute('contenteditable')==='false')return NodeFilter.FILTER_REJECT;
      return node.nodeType===Node.TEXT_NODE||node instanceof HTMLBRElement?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP;
    },
  });
  while(walker.nextNode()){
    const node=walker.currentNode,value=node instanceof HTMLBRElement?'\n':node.textContent||'';
    parts.push({node,start:text.length,end:text.length+value.length});text+=value;
  }
  let offset=0;
  for(const part of parts){
    if(part.node===caret.startContainer){offset=part.start+caret.startOffset;break;}
    const end=document.createRange();end.selectNode(part.node);end.collapse(false);
    if(end.compareBoundaryPoints(Range.START_TO_START,caret)<=0)offset=part.end;
  }
  const rangeFor=(start:number,end:number)=>{
    const range=document.createRange();
    const point=(value:number,isEnd:boolean)=>{
      const part=parts.find(p=>isEnd?value>p.start&&value<=p.end:value>=p.start&&value<p.end)||parts.at(-1);
      if(!part)return {node:root,offset:0};
      if(part.node instanceof HTMLBRElement){const parent=part.node.parentNode!;return {node:parent,offset:Array.from(parent.childNodes).findIndex(child=>child===part.node)+(value>part.start?1:0)};}
      return {node:part.node,offset:Math.max(0,Math.min(value-part.start,part.end-part.start))};
    };
    const a=point(start,false),b=point(end,true);range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);return range;
  };
  return {text,offset,rangeFor};
}

type PickerState={rect:{left:number;top:number;bottom:number};suggested?:string};
export function useEmojiPicker(onChoose:(emoji:string)=>void,onCancel:(restoreFocus:boolean)=>void){
  const [state,setState]=useState<PickerState|null>(null);
  const callbacks=useRef({onChoose,onCancel});useLayoutEffect(()=>{callbacks.current={onChoose,onCancel};});const active=useRef(false);
  const close=(restoreFocus=true)=>{if(!active.current)return;active.current=false;setState(null);callbacks.current.onCancel(restoreFocus);};
  return {
    open:(rect:DOMRect,suggested?:string)=>{active.current=true;setState({rect:{left:rect.left,top:rect.top,bottom:rect.bottom},suggested});},
    node:state?<EmojiPicker state={state} choose={value=>{if(!active.current)return;active.current=false;setState(null);callbacks.current.onChoose(value);}} close={close}/>:null,
  };
}

type EmojiEntry=[string,string,string];
const CATEGORIES=[['🙂','Smileys & Emotion','Faces'],['👋','People & Body','People'],['🌿','Animals & Nature','Nature'],['🍎','Food & Drink','Food'],['🚀','Travel & Places','Travel'],['⚽','Activities','Activities'],['💡','Objects','Objects'],['❤️','Symbols','Symbols'],['🏳️','Flags','Flags']];
const POPULAR=['😃','😀','🙂','😊','😂','😍','🥰','😎','🤔','😉','😛','😮','🙁','😢','😭','👍','👎','👏','🙏','💪','❤️','🔥','✨','🎉','✅','⭐','💡','📌','🚀','👀','🙌','💯'];
const ALIASES:Record<string,string>={'😃':'cuoi vui smile :D','🙂':'cuoi vui :)','😊':'cuoi vui','😂':'cuoi haha','😉':'nhay mat ;)','😛':'le luoi :P','😮':'ngac nhien :O','🙁':'buon :(','😭':'khoc buon','❤️':'tim yeu love <3','👍':'tot dong y ok','✅':'xong done check','🔥':'lua hot','💡':'y tuong idea','🎉':'chuc mung party','🙏':'cam on thanks','📌':'ghim pin','🚀':'ten lua launch'};
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();

function EmojiPicker({state,choose,close}:{state:PickerState;choose:(value:string)=>void;close:(restore?:boolean)=>void}){
  const root=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),id=useId();
  const [data,setData]=useState<EmojiEntry[]|null>(null),[error,setError]=useState(false);
  const [query,setQuery]=useState(''),[category,setCategory]=useState(''),[index,setIndex]=useState(0),[limit,setLimit]=useState(160);
  const [viewport,setViewport]=useState(()=>({width:window.visualViewport?.width||window.innerWidth,height:window.visualViewport?.height||window.innerHeight,top:window.visualViewport?.offsetTop||0}));
  useEffect(()=>{let alive=true;import('./emoji-data').then(module=>{if(alive)setData(module.default);}).catch(()=>{if(alive)setError(true);});search.current?.focus({preventScroll:true});return()=>{alive=false;};},[]);
  const closeRef=useRef(close);useLayoutEffect(()=>{closeRef.current=close;});
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))closeRef.current(false);};
    const focus=(event:FocusEvent)=>{if(!root.current?.contains(event.target as Node))closeRef.current(false);};
    const resize=()=>setViewport({width:window.visualViewport?.width||window.innerWidth,height:window.visualViewport?.height||window.innerHeight,top:window.visualViewport?.offsetTop||0});
    document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',focus);window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',focus);window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);};
  },[]);
  const results=useMemo(()=>{
    if(!data)return [];
    const q=normalize(query.trim()),filtered=data.filter(item=>(!category||item[2]===category)&&(!q||normalize(item[1]+' '+item[0]+' '+(ALIASES[item[0]]||'')).includes(q)));
    if(q||category)return filtered;
    const popular=Array.from(new Set([state.suggested,...POPULAR].filter(Boolean)));
    return [...popular.map(emoji=>data.find(item=>item[0]===emoji)).filter((item):item is EmojiEntry=>!!item),...filtered.filter(item=>!popular.includes(item[0]))];
  },[data,query,category,state.suggested]);
  const visible=results.slice(0,limit),active=Math.min(index,visible.length-1);
  useEffect(()=>{root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[active]);
  const width=Math.min(336,viewport.width-16),height=Math.min(370,viewport.height-16);
  const left=Math.max(8,Math.min(state.rect.left,viewport.width-width-8));
  const below=viewport.top+viewport.height-state.rect.bottom-8;
  const top=Math.max(viewport.top+8,Math.min(below>=height?state.rect.bottom+6:state.rect.top-height-6,viewport.top+viewport.height-height-8));
  const reset=()=>{setIndex(0);setLimit(160);root.current?.querySelector('.emoji-grid-scroll')?.scrollTo(0,0);};
  return createPortal(<div ref={root} className="emoji-picker" role="dialog" aria-label="Choose emoji" style={{left,top,width,maxHeight:height}} onKeyDown={event=>{
    event.stopPropagation();if(event.nativeEvent.isComposing||event.keyCode===229)return;
    if(event.key==='Escape'){event.preventDefault();close(true);return;}
    if(event.key==='Enter'&&event.target===search.current){event.preventDefault();if(visible[active])choose(visible[active][0]);return;}
    const inGrid=event.target instanceof Element&&!!event.target.closest('.emoji-grid');
    const step=event.target!==search.current&&!inGrid?0:event.key==='ArrowDown'?8:event.key==='ArrowUp'?-8:event.key==='ArrowRight'&&inGrid?1:event.key==='ArrowLeft'&&inGrid?-1:0;
    if(step&&visible.length){event.preventDefault();const current=inGrid?Number((event.target as HTMLElement).dataset.emojiIndex):index;const next=Math.max(0,Math.min(visible.length-1,current+step));setIndex(next);if(inGrid)root.current?.querySelector<HTMLElement>(`[id="${id}-${next}"]`)?.focus({preventScroll:true});}
  }}>
    <div className="emoji-picker-heading"><span>Emoji</span><button type="button" aria-label="Close emoji picker" onClick={()=>close(true)}>×</button></div>
    <input ref={search} className="emoji-search" type="search" aria-label="Search emoji" placeholder="Search emoji…" value={query} onChange={event=>{setQuery(event.target.value);reset();}} autoComplete="off" autoCorrect="off" spellCheck={false} aria-controls={`${id}-grid`} aria-activedescendant={active>=0?`${id}-${active}`:undefined}/>
    <div className="emoji-categories" aria-label="Emoji categories"><button type="button" title="All emoji" aria-label="All emoji" aria-pressed={!category} onClick={()=>{setCategory('');reset();}}>◷</button>{CATEGORIES.map(([icon,key,label])=><button type="button" key={key} title={label} aria-label={label} aria-pressed={category===key} onClick={()=>{setCategory(category===key?'':key);reset();}}>{icon}</button>)}</div>
    <div className="emoji-grid-scroll"><div className="emoji-grid" role="listbox" aria-label="Emoji results" id={`${id}-grid`}>{visible.map(([emoji,name],i)=><button type="button" role="option" id={`${id}-${i}`} key={emoji} data-emoji-index={i} tabIndex={i===active?0:-1} aria-selected={i===active} aria-label={name} title={name} onPointerDown={event=>event.preventDefault()} onFocus={()=>setIndex(i)} onClick={()=>choose(emoji)}>{emoji}</button>)}</div>
      {!visible.length&&<div className="emoji-empty" role="status">{error?'Could not load emoji. Close and try again.':data?'No matching emoji':'Loading emoji…'}</div>}
      {results.length>limit&&<button type="button" className="emoji-more" onClick={()=>setLimit(current=>current+160)}>Show more</button>}
    </div>
    <div className="emoji-picker-footer">{visible[active]?.[1]||'Choose an emoji'}<span>Esc to close</span></div>
  </div>,document.body);
}
