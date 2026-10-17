import {emojiTextMap} from './editor-emoji';
import {editorMediaUrl, type EditorMedia} from './editor-inserts';

export type AutoLink={start:number;end:number;href:string;auto?:boolean};
type NormalizeLink=(value:string)=>string;
const TOKEN=/(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s<>"'`]*)?/gi;
const FILE_SUFFIX=/\.(?:tsx?|jsx?|json|png|jpe?g|gif|svg|webp|pdf|docx?|xlsx?|pptx?|mp[34]|zip|csv)$/i;
function trimUrlToken(value:string){
  let token=value.replace(/[.,;:!?…]+$/g,'');
  for(const [open,close] of [['(',')'],['[',']'],['{','}']])while(token.endsWith(close)&&token.split(close).length>token.split(open).length)token=token.slice(0,-1);
  return token.replace(/[.,;:!?…]+$/g,'');
}
export function detectAutoLinks(text:string,normalize:NormalizeLink,complete=true):AutoLink[]{
  const result:AutoLink[]=[];TOKEN.lastIndex=0;
  for(const match of text.matchAll(TOKEN)){
    const start=match.index,previous=text[start-1]||'';
    if(previous&&/[\w@/:.-]/.test(previous))continue;
    const token=trimUrlToken(match[0]);const end=start+token.length;
    if(!token||token.length>4096||!complete&&end===text.length)continue;
    if(!/^(https?:\/\/|www\.)/i.test(token)&&FILE_SUFFIX.test(token))continue;
    const href=normalize(token);if(!/^https?:\/\//i.test(href))continue;
    try{const url=new URL(href);if(url.username||url.password||!url.hostname)continue;}catch{continue;}
    result.push({start,end,href});
  }
  return result;
}
export function mergeAutoLinks(text:string,current:AutoLink[],excluded:{start:number;end:number}[],normalize:NormalizeLink,complete=true){
  const overlaps=(a:{start:number;end:number},b:{start:number;end:number})=>a.start<b.end&&a.end>b.start;
  const manual=current.filter(link=>!link.auto),automatic=current.filter(link=>link.auto);
  const additions=detectAutoLinks(text,normalize,true).filter(candidate=>
    (complete||candidate.end<text.length||automatic.some(link=>overlaps(link,candidate)))&&
    ![...manual,...excluded].some(range=>overlaps(range,candidate))
  ).map(link=>({...link,auto:true}));
  const next=[...manual,...additions].sort((a,b)=>a.start-b.start);
  return next.length===current.length&&next.every((link,index)=>link.start===current[index].start&&link.end===current[index].end&&link.href===current[index].href&&!!link.auto===!!current[index].auto)?current:next;
}
export function canAutoEmbedLinks(text:string,links:AutoLink[],normalize:NormalizeLink){
  return links.every(link=>{if(link.auto)return true;try{return new URL(normalize(text.slice(link.start,link.end))).href===new URL(link.href).href;}catch{return false;}});
}
export function hasNewAutoLinks(current:AutoLink[],next:AutoLink[]){
  return next.some(link=>link.auto&&!current.some(old=>old.auto&&old.start<link.end&&old.end>link.start));
}
export function domRowLinks(row:HTMLElement):AutoLink[]{
  return Array.from(row.querySelectorAll<HTMLAnchorElement>('a[href]')).map(anchor=>{
    const start=document.createRange();start.selectNodeContents(anchor);start.collapse(true);
    const end=document.createRange();end.selectNodeContents(anchor);end.collapse(false);
    return {start:emojiTextMap(row,start).offset,end:emojiTextMap(row,end).offset,href:anchor.getAttribute('href')||'',auto:anchor.getAttribute('data-editor-autolink')==='true'};
  });
}
export function standaloneYouTube(text:string,normalize:NormalizeLink):EditorMedia|null{
  const value=text.trim();const links=detectAutoLinks(value,normalize,true);
  if(links.length!==1||links[0].start!==0||links[0].end!==value.length)return null;
  const media=editorMediaUrl('video',links[0].href.replace(/^http:/i,'https:'));
  return media?.url.startsWith('https://www.youtube-nocookie.com/embed/')?media:null;
}
export function autoLinkRow(root:HTMLElement,node:Node|null):HTMLElement|null{
  const element=node instanceof Element?node:node?.parentElement;
  if(!element||element.closest('code,pre,figure,[data-editor-table],[data-table-controls],[data-editor-tree]'))return null;
  const row=element===root?root:element.closest<HTMLElement>('p,li,h1,h2,h3,blockquote,summary,div');
  if(!row||!root.contains(row)||row.querySelector('ul,ol,table,figure,details')||row.hasAttribute('data-editor-column')||row.hasAttribute('data-editor-columns')||row.hasAttribute('data-editor-callout'))return null;
  return row;
}
export function canEmbedYouTubeRow(root:HTMLElement,row:HTMLElement){
  return row!==root&&row.tagName!=='SUMMARY'&&!row.hasAttribute('data-editor-todo')&&!row.querySelector('ul,ol,details,code,pre')&&!row.parentElement?.closest('li');
}
export function linkifyDomRow(row:HTMLElement,normalize:NormalizeLink,complete:boolean,beforeChange:(newFormat:boolean)=>void){
  const selection=document.getSelection(),caret=selection?.rangeCount?selection.getRangeAt(0):document.createRange();
  const inside=!!caret&&row.contains(caret.startContainer)&&row.contains(caret.endContainer);
  const probe=inside?caret.cloneRange():document.createRange();if(!inside){probe.selectNodeContents(row);probe.collapse(false);}
  const map=emojiTextMap(row,probe);
  let saved:{start:number;end:number;backward:boolean}|null=null;
  if(inside){const end=caret!.cloneRange();end.collapse(false);saved={start:map.offset,end:emojiTextMap(row,end).offset,backward:selection?.anchorNode===caret!.endContainer&&selection.anchorOffset===caret!.endOffset&&!caret!.collapsed};}
  const current=domRowLinks(row);
  const excluded=Array.from(row.querySelectorAll('code,pre')).map(node=>{
    const start=document.createRange();start.selectNodeContents(node);start.collapse(true);
    const end=document.createRange();end.selectNodeContents(node);end.collapse(false);
    return {start:emojiTextMap(row,start).offset,end:emojiTextMap(row,end).offset};
  });
  const nextLinks=mergeAutoLinks(map.text,current,excluded,normalize,complete);
  if(nextLinks===current)return false;
  beforeChange(hasNewAutoLinks(current,nextLinks));const inserted:{end:number;anchor:HTMLAnchorElement}[]=[];
  row.querySelectorAll('a[data-editor-autolink="true"]').forEach(anchor=>anchor.replaceWith(...Array.from(anchor.childNodes)));
  const unwrapped=emojiTextMap(row,probe);
  for(const match of nextLinks.filter(link=>link.auto).reverse()){
    const range=unwrapped.rangeFor(match.start,match.end);const anchor=document.createElement('a');
    anchor.href=match.href;anchor.target='_blank';anchor.rel='noopener noreferrer';
    anchor.setAttribute('data-editor-autolink','true');
    anchor.appendChild(range.extractContents());range.insertNode(anchor);inserted.push({end:match.end,anchor});
  }
  if(saved&&selection){
    const refreshed=emojiTextMap(row,probe);const next=refreshed.rangeFor(saved.start,saved.end);
    if(saved.start===saved.end){next.collapse(true);const atEnd=inserted.find(link=>link.end===saved!.end);if(atEnd){next.setStartAfter(atEnd.anchor);next.collapse(true);}}
    if(saved.backward)selection.setBaseAndExtent(next.endContainer,next.endOffset,next.startContainer,next.startOffset);
    else{selection.removeAllRanges();selection.addRange(next);}
  }
  return true;
}
