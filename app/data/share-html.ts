import {imageId} from '../image-files';
import {parseNoteAttribute,type NoteBlock,type NoteInline} from '../blocknote-document';
import {parseHTML} from 'linkedom';

const tags = new Set('p div br ul ol li blockquote h1 h2 h3 strong b em i u s strike del code mark sub sup a span details summary hr figure img video iframe table tbody thead tr td th'.split(' '));
const dangerous = new Set('script style template svg math object embed form input button textarea select option noscript noembed noframes plaintext xmp title base link meta'.split(' '));
export function privateImageId(raw: string, origin: string): string | null {
  try { const u = new URL(raw, origin); const id = u.pathname.slice('/api/images/'.length);
    return u.origin === origin && u.pathname.startsWith('/api/images/') && !u.search && !u.hash && imageId(id) ? id.toLowerCase() : null;
  } catch { return null; }
}
export async function imageReferences(html: string, origin: string) {
  const ids = new Set<string>();
  const {document}=parseHTML('<!doctype html><html><body>'+html+'</body></html>');
  for(const element of document.body.querySelectorAll('img[src]')){const id=privateImageId(element.getAttribute('src')||'',origin);if(id)ids.add(id);}
  return ids;
}
function safeStyle(raw: string) {
  return raw.split(';').map(part=>part.trim()).filter(part=>{
    const colon=part.indexOf(':'); const key=part.slice(0,colon).trim().toLowerCase(), value=part.slice(colon+1).trim();
    if (['color','background-color'].includes(key)) return /^(#[\da-f]{3,8}|rgba?\([\d\s.,%+-]+\)|hsla?\([\d\s.,%+-]+\)|[a-z]+)$/i.test(value);
    if (key==='font-size') return /^(\d+(\.\d+)?(px|em|rem|%)|small|large|smaller|larger)$/.test(value) && (isNaN(parseFloat(value))||parseFloat(value)<=300);
    if(key==='font-family')return /^(serif|monospace|sans-serif)$/.test(value);
    if(key==='text-align')return /^(left|center|right|justify)$/.test(value);
    if(key==='direction')return /^(ltr|rtl)$/.test(value);
    return key==='margin-inline-start' && /^\d+(\.\d+)?em$/.test(value) && parseFloat(value)<=25;
  }).join(';');
}
type Options={origin:string;token:string;assets:Set<string>;mode:'read'|'write'};
// Structural, server-only HTML parser. Never strip HTML with regular expressions.
export async function shareHtml(html: string, options: Options): Promise<string> {
  const {origin,token,assets,mode}=options;
  const {document}=parseHTML('<!doctype html><html><body>'+html+'</body></html>');
  const sanitize=(e:Element)=>{
    const tag=e.tagName.toLowerCase();
    if(e.namespaceURI!=='http://www.w3.org/1999/xhtml'||dangerous.has(tag)){e.remove();return;}
    if(!tags.has(tag)){e.remove();return;}
    const attrs=Object.fromEntries(Array.from(e.attributes).map(attribute=>[attribute.name,attribute.value]));
    for(const name of Object.keys(attrs))e.removeAttribute(name);
    const set=(key:string,value:string|undefined)=>{if(value!==undefined)e.setAttribute(key,value);};
    if(tag==='div'&&attrs['data-blocknote-document']){
      const blocks=parseNoteAttribute(attrs['data-blocknote-document']);
      if(blocks){
        const url=(raw:string)=>{try{const u=new URL(raw,origin);if(u.origin!==origin||!u.pathname.startsWith('/api/'))return raw;const prefix='/api/shared/'+token+'/images/';const id=privateImageId(raw,origin)||(u.pathname.startsWith(prefix)&&imageId(u.pathname.slice(prefix.length))?u.pathname.slice(prefix.length):null);return id&&assets.has(id)?origin+(mode==='read'?prefix:'/api/images/')+id:'';}catch{return '';}};
        const inline=(items:NoteInline[]):NoteInline[]=>items.flatMap(item=>{if(item.type!=='link')return [item];const content=inline(item.content),href=url(item.href);return href?[{...item,href,content}]:content;});
        const walk=(list:NoteBlock[])=>list.forEach(block=>{if(['image','video'].includes(block.type)&&block.props?.url)block.props.url=url(String(block.props.url));if(Array.isArray(block.content))block.content=inline(block.content);else if(block.content)block.content.rows.forEach(row=>{row.cells=row.cells.map(cell=>Array.isArray(cell)?inline(cell):{...cell,content:inline(cell.content)});});if(block.children)walk(block.children);});
        walk(blocks);set('data-blocknote-document',JSON.stringify(blocks));
      }
    }
    if(attrs.style){const style=safeStyle(attrs.style);if(style)set('style',style);}
    if(attrs.class){const classes=attrs.class.split(/\s+/).filter(c=>/^ql-(align-(center|right|justify)|direction-rtl|font-(serif|monospace)|size-(small|large|huge)|indent-([1-9]|1[0-2]))$/.test(c)||tag==='li'&&/^editor-indent-(start|end)$/.test(c));if(classes.length)set('class',classes.join(' '));}
    for(const key of ['start','value'])if((key==='start'&&tag==='ol'||key==='value'&&tag==='li')&&/^[1-9]\d{0,4}$/.test(attrs[key]||''))set(key,attrs[key]);
    if(['li','p'].includes(tag)&&/^([1-9]|1[0-2])$/.test(attrs['data-list-extra-indent']||''))set('data-list-extra-indent',attrs['data-list-extra-indent']);
    if(tag==='li'){
      if(/^(bullet|ordered)$/.test(attrs['data-list']||''))set('data-list',attrs['data-list']);
      if(/^[1-9]\d{0,5}(\.[1-9]\d{0,5}){0,12}$/.test(attrs['data-list-number']||''))set('data-list-number',attrs['data-list-number']);
    }
    if(tag==='p'&&/^(true|false)$/.test(attrs['data-editor-todo']||''))set('data-editor-todo',attrs['data-editor-todo']);
    if(['p','h1','h2','h3','blockquote','summary'].includes(tag)&&attrs['data-editor-compact']==='true')set('data-editor-compact','true');
    if(tag==='details'){if(/^[\w-]{1,80}$/.test(attrs['data-editor-toggle']||''))set('data-editor-toggle',attrs['data-editor-toggle']);set('open','');}
    if(tag==='div'){
      if(/^[\w-]{1,80}$/.test(attrs['data-editor-callout']||''))set('data-editor-callout',attrs['data-editor-callout']);
      if(/^[23]$/.test(attrs['data-editor-columns']||''))set('data-editor-columns',attrs['data-editor-columns']);
      if(/^[1-3]$/.test(attrs['data-editor-column']||''))set('data-editor-column',attrs['data-editor-column']);
      if(/^[\w-]{1,80}$/.test(attrs['data-layout-id']||''))set('data-layout-id',attrs['data-layout-id']);
    }
    if(tag==='div'&&/^[\w-]{1,80}$/.test(attrs['data-editor-table']||''))set('data-editor-table',attrs['data-editor-table']);
    if(tag==='div'&&/^(true|false)$/.test(attrs['data-table-header']||''))set('data-table-header',attrs['data-table-header']);
    if(tag==='div'){
      for(const key of ['data-editor-tree','data-tree-node','data-tree-parent'])if(/^[\w-]{1,80}$/.test(attrs[key]||''))set(key,attrs[key]);
      if(/^(true|false)$/.test(attrs['data-tree-collapsed']||''))set('data-tree-collapsed',attrs['data-tree-collapsed']);
      if(/^(?:[0-9]|1[0-2])$/.test(attrs['data-tree-depth']||''))set('data-tree-depth',attrs['data-tree-depth']);
      for(const key of ['data-tree-title','data-tree-header','data-tree-name-cell'])if(key in attrs)set(key,'');
    }
    if(tag==='span'&&/^(name|note)$/.test(attrs['data-tree-field']||''))set('data-tree-field',attrs['data-tree-field']);
    if(tag==='span'&&'data-tree-marker' in attrs)set('data-tree-marker','');
    if(tag==='a'){
      try{const u=new URL(attrs.href||'',origin);let href=u.href;
        if(u.origin===origin&&u.pathname.startsWith('/api/')){
          const prefix='/api/shared/'+token+'/images/';
          const id=privateImageId(href,origin)||(u.pathname.startsWith(prefix)&&imageId(u.pathname.slice(prefix.length))?u.pathname.slice(prefix.length).toLowerCase():null);
          if(!id||!assets.has(id))return;
          href=origin+(mode==='read'?prefix:'/api/images/')+id;
        }
        if(['https:','http:','mailto:','tel:'].includes(u.protocol)&&!u.username&&!u.password){set('href',href);set('target','_blank');set('rel','noopener noreferrer');if(attrs['data-editor-autolink']==='true')set('data-editor-autolink','true');}
      }catch{}
    }
    if(tag==='figure'&&/^(image|video)$/.test(attrs['data-editor-media']||''))set('data-editor-media',attrs['data-editor-media']);
    if(tag==='figure'&&attrs['data-editor-media']==='image'){const width=Number(attrs['data-editor-width']);if(Number.isFinite(width)&&width>=80&&width<=2400){set('data-editor-width',String(Math.round(width)));set('style','width:'+Math.round(width)+'px');}}
    if(['img','iframe','video'].includes(tag)){
      let u:URL;try{u=new URL(attrs.src||'',origin);}catch{e.remove();return;}
      if(u.username||u.password){e.remove();return;}
      let id=privateImageId(u.href,origin);
      const sharedPrefix='/api/shared/'+token+'/images/';
      if(u.origin===origin&&u.pathname.startsWith(sharedPrefix)&&!u.search&&!u.hash){const candidate=u.pathname.slice(sharedPrefix.length);if(imageId(candidate))id=candidate.toLowerCase();}
      if(u.origin===origin){
        if(tag!=='img'||!id||!assets.has(id)){e.remove();return;}
        set('src',origin+(mode==='read'?sharedPrefix:'/api/images/')+id);
      }else{
        if(u.protocol!=='https:'){e.remove();return;}
        if(tag==='iframe'&&!/^https:\/\/(www\.youtube-nocookie\.com\/embed\/[\w-]{11}|player\.vimeo\.com\/video\/\d+)\/?$/.test(u.href)){e.remove();return;}
        set('src',u.href);
      }
      set('referrerpolicy','no-referrer');
      if(tag==='img'){set('alt',(attrs.alt||'Photo').slice(0,300));set('loading','lazy');set('decoding','async');}
      if(tag==='video'){set('controls','');set('preload','none');}
      if(tag==='iframe'){set('referrerpolicy','strict-origin-when-cross-origin');set('title','Embedded video');set('loading','lazy');set('sandbox','allow-scripts allow-same-origin allow-presentation');set('allow','fullscreen; picture-in-picture');set('allowfullscreen','');}
    }
  };
  const walk=(node:Node)=>{for(const child of Array.from(node.childNodes)){if(child.nodeType===8){child.parentNode?.removeChild(child);continue;}if(child.nodeType!==1)continue;const element=child as Element;sanitize(element);if(element.parentNode)walk(element);}};
  walk(document.body);
  return document.body.innerHTML;
}
