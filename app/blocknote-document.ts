// No editor-library dependency: these helpers are also used at the storage/share boundary.
export type NoteInline={type:'text';text:string;styles:Record<string,string|boolean>}|{type:'link';href:string;content:NoteInline[]};
export type NoteBlock={id?:string;type:string;props?:Record<string,unknown>;content?:NoteInline[]|{type:'tableContent';rows:{cells:(NoteInline[]|{type:'tableCell';content:NoteInline[];props?:Record<string,unknown>})[]}[];columnWidths?:unknown[];headerRows?:number;headerCols?:number};children?:NoteBlock[]};
const TYPES=new Set(['paragraph','heading','bulletListItem','numberedListItem','checkListItem','quote','table','toggleListItem','image','video','divider']);
const COLOR=/^(default|[a-z]{1,25}|#[\da-f]{3,8}|rgba?\([\d\s.,%+-]+\)|hsla?\([\d\s.,%+-]+\))$/i;
export function noteUrl(raw:unknown,image=false):boolean{
 if(typeof raw!=='string'||raw.length>5000)return false;if(raw===''&&image)return true;
 if(/^\/api\/(?:images\/[-\da-f]{36}|shared\/[\w.-]+\/images\/[-\da-f]{36})$/i.test(raw))return true;
 try{const url=new URL(raw);return !url.username&&!url.password&&(image?url.protocol==='https:':['https:','http:','mailto:','tel:'].includes(url.protocol));}catch{return false;}
}
export function validNoteBlocks(value:unknown):value is NoteBlock[]{
 let count=0,budget=0;
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 function props(value:unknown){return value===undefined||object(value)&&Object.entries(value).every(([key,v])=>{
  if(['textColor','backgroundColor'].includes(key))return typeof v==='string'&&COLOR.test(v);
  if(key==='textAlignment')return ['left','center','right','justify'].includes(String(v));
  if(key==='url')return noteUrl(v,true);
  if(['caption','name'].includes(key))return typeof v==='string'&&v.length<=10000;
  if(['checked','isToggleable','showPreview'].includes(key))return typeof v==='boolean';
  if(['level','start','previewWidth','colspan','rowspan'].includes(key))return v===undefined||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000;
  return false;
 });}
 function inline(value:unknown,depth=0):boolean{return depth<8&&Array.isArray(value)&&value.every(v=>{
  if(++budget>40000||!object(v))return false;
  if(v.type==='link')return Object.keys(v).every(k=>['type','href','content'].includes(k))&&noteUrl(v.href)&&inline(v.content,depth+1);
  return v.type==='text'&&Object.keys(v).every(k=>['type','text','styles'].includes(k))&&typeof v.text==='string'&&v.text.length<=500000&&object(v.styles)&&Object.entries(v.styles).every(([k,s])=>['bold','italic','underline','strike','code'].includes(k)?typeof s==='boolean':['textColor','backgroundColor'].includes(k)&&typeof s==='string'&&COLOR.test(s));
 });}
 function blocks(value:unknown,depth=0):boolean{return depth<=12&&Array.isArray(value)&&value.length>0&&value.every(b=>{
  if(++count>3000||!object(b)||!TYPES.has(String(b.type))||Object.keys(b).some(k=>!['id','type','props','content','children'].includes(k))||b.id!==undefined&&(typeof b.id!=='string'||!/^[\w-]{1,100}$/.test(b.id))||!props(b.props))return false;
  if(b.children!==undefined&&(!Array.isArray(b.children)||b.children.length>0&&!blocks(b.children,depth+1)))return false;
  if(['image','video','divider'].includes(String(b.type)))return b.content===undefined;
  if(b.type==='table'){
   const c=b.content;return object(c)&&c.type==='tableContent'&&Object.keys(c).every(k=>['type','rows','columnWidths','headerRows','headerCols'].includes(k))&&[c.headerRows,c.headerCols].every(n=>n===undefined||Number.isInteger(n)&&Number(n)>=0&&Number(n)<=100)&&(!c.columnWidths||Array.isArray(c.columnWidths)&&c.columnWidths.length<=30&&c.columnWidths.every(n=>n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10000))&&Array.isArray(c.rows)&&c.rows.length>0&&c.rows.length<=200&&c.rows.every(r=>object(r)&&Object.keys(r).every(k=>k==='cells')&&Array.isArray(r.cells)&&r.cells.length>0&&r.cells.length<=30&&r.cells.every(cell=>Array.isArray(cell)?inline(cell):object(cell)&&cell.type==='tableCell'&&Object.keys(cell).every(k=>['type','content','props'].includes(k))&&props(cell.props)&&inline(cell.content)));
  }
  return b.content===undefined||inline(b.content);
 });}
 return blocks(value);
}
export function parseNoteJson(raw:string):NoteBlock[]|null{try{if(raw.length>750000)return null;const value=JSON.parse(raw);return validNoteBlocks(value)?value:null;}catch{return null;}}
// HTMLRewriter exposes source-encoded attribute values; decode only our text encoding, once.
export function parseNoteAttribute(raw:string){return parseNoteJson(raw)||parseNoteJson(raw.replace(/&(quot|amp|lt|gt|#39);/g,(_,name:string)=>({quot:'"',amp:'&',lt:'<',gt:'>', '#39':"'"}[name]!)));}
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function inlineHtml(items:NoteInline[]=[]):string{return items.map(item=>{
 if(item.type==='link')return `<a href="${esc(item.href)}">${inlineHtml(item.content)}</a>`;
 let text=esc(item.text).replace(/\n/g,'<br>');for(const [key,tag] of [['bold','strong'],['italic','em'],['underline','u'],['strike','s'],['code','code']])if(item.styles[key])text=`<${tag}>${text}</${tag}>`;
 const styles=[item.styles.textColor&&item.styles.textColor!=='default'?`color:${item.styles.textColor}`:'',item.styles.backgroundColor&&item.styles.backgroundColor!=='default'?`background-color:${item.styles.backgroundColor}`:''].filter(Boolean).join(';');
 return styles?`<span style="${esc(styles)}">${text}</span>`:text;
 }).join('');}
export function noteBlocksHtml(blocks:NoteBlock[]):string{return blocks.map(block=>{
 const p=block.props||{},content=Array.isArray(block.content)?inlineHtml(block.content):'',child=block.children?.length?noteBlocksHtml(block.children):'';
 const style=[p.textAlignment&&p.textAlignment!=='left'?`text-align:${p.textAlignment}`:'',p.textColor&&p.textColor!=='default'?`color:${p.textColor}`:'',p.backgroundColor&&p.backgroundColor!=='default'?`background-color:${p.backgroundColor}`:''].filter(Boolean).join(';'),attrs=style?` style="${esc(style)}"`:'';
 if(block.type==='table'&&block.content&&!Array.isArray(block.content)){const table=block.content;return `<div data-editor-table="table-${esc(block.id||'note')}" data-table-header="${!!table.headerRows}"><table><tbody>${table.rows.map((row,r)=>`<tr>${row.cells.map((cell,c)=>{const tag=r<(table.headerRows||0)||c<(table.headerCols||0)?'th':'td';return `<${tag}>${inlineHtml(Array.isArray(cell)?cell:cell.content)||'<br>'}</${tag}>`;}).join('')}</tr>`).join('')}</tbody></table></div>${child}`;}
 if(block.type==='image')return p.url?`<figure data-editor-media="image"${typeof p.previewWidth==='number'?` data-editor-width="${Math.max(80,Math.min(2400,p.previewWidth))}"`:''}><img src="${esc(p.url)}" alt="${esc(p.caption||p.name||'Photo')}"></figure>${child}`:`<p data-editor-compact="true"><br></p>${child}`;
 if(block.type==='video')return p.url?`<figure data-editor-media="video">${/^https:\/\/(?:www\.youtube-nocookie\.com\/embed\/[\w-]{11}|player\.vimeo\.com\/video\/\d{1,12})$/.test(String(p.url))?`<iframe src="${esc(p.url)}" title="Embedded video" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`:`<video src="${esc(p.url)}" controls preload="none"></video>`}<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open video</a></figure>${child}`:`<p data-editor-compact="true"><br></p>${child}`;
 if(block.type==='divider')return `<hr>${child}`;
 if(block.type==='toggleListItem'||block.type==='heading'&&p.isToggleable)return `<details data-editor-toggle="${esc(block.id||'note-toggle')}" open><summary data-editor-compact="true"${attrs}>${content||'<br>'}</summary>${child||'<p data-editor-compact="true"><br></p>'}</details>`;
 if(block.type==='bulletListItem'||block.type==='numberedListItem'){const tag=block.type==='bulletListItem'?'ul':'ol';return `<${tag}${tag==='ol'&&p.start?` start="${esc(p.start)}"`:''}><li${attrs}>${content||'<br>'}${child}</li></${tag}>`;}
 const tag=block.type==='heading'?`h${Math.max(1,Math.min(3,Number(p.level)||1))}`:block.type==='quote'?'blockquote':'p';return `<${tag} data-editor-compact="true"${block.type==='checkListItem'?` data-editor-todo="${p.checked===true}"`:''}${attrs}>${content||'<br>'}</${tag}>${child}`;
 }).join('');}
export function noteEnvelope(blocks:NoteBlock[],fallback=noteBlocksHtml(blocks)){return `<div data-blocknote-document="${esc(JSON.stringify(blocks))}">${fallback}</div>`;}
const cache=new Map<string,{blocks:NoteBlock[];fallback:string}|null>();
const normalizedCache=new Map<string,string>();
export function canonicalNoteEnvelope(html:string){
 if(normalizedCache.has(html))return normalizedCache.get(html)!;
 const envelope=readNoteEnvelope(html);if(!envelope)return null;
 // Validated JSON is authoritative. Generate escaped, allowlisted HTML directly;
 // never run the full Customer 1 DOM-normalization pipeline on every BlockNote save.
 const result=noteEnvelope(envelope.blocks);normalizedCache.set(html,result);if(normalizedCache.size>6)normalizedCache.delete(normalizedCache.keys().next().value!);return result;
}
export function readNoteEnvelope(html:string){
 if(!html.includes('data-blocknote-document')||typeof DOMParser==='undefined')return null;
 if(cache.has(html))return cache.get(html)!;
 const doc=new DOMParser().parseFromString(html,'text/html'),root=doc.body.firstElementChild,blocks=root&&doc.body.children.length===1&&root.tagName==='DIV'?parseNoteJson(root.getAttribute('data-blocknote-document')||''):null;
 const result=blocks&&root?{blocks,fallback:root.innerHTML}:null;cache.set(html,result);if(cache.size>6)cache.delete(cache.keys().next().value!);return result;
}
// Lossless fast import for simple Customer 1 HTML. Extended formats use blocknote-import.
export function importCustomerNote(html:string):NoteBlock[]|null{
 if(typeof DOMParser==='undefined')return null;
 const root=new DOMParser().parseFromString(html,'text/html').body;
 if(Array.from(root.querySelectorAll('*')).some(el=>Array.from(el.attributes).some(a=>!['data-editor-compact','data-editor-todo','href','target','rel'].includes(a.name))))return null;
 let failed=false;
 function inline(node:Node,styles:Record<string,string|boolean>={}):NoteInline[]{
  if(node.nodeType===3)return [{type:'text',text:node.textContent||'',styles}];
  if(!(node instanceof Element))return [];
  if(node.tagName==='BR')return [{type:'text',text:'\n',styles}];
  if(node.tagName==='A'){const href=node.getAttribute('href')||'';if(!noteUrl(href)){failed=true;return [];}return [{type:'link',href,content:Array.from(node.childNodes).flatMap(n=>inline(n,styles))}];}
  const mark:Record<string,string>={STRONG:'bold',B:'bold',EM:'italic',I:'italic',U:'underline',S:'strike',STRIKE:'strike',DEL:'strike',CODE:'code'};
  if(!mark[node.tagName]){failed=true;return [];}
  return Array.from(node.childNodes).flatMap(n=>inline(n,{...styles,[mark[node.tagName]]:true}));
 }
 function content(el:Element){const nodes=Array.from(el.childNodes).filter(n=>!(n instanceof Element&&['UL','OL'].includes(n.tagName)));if(nodes.length===1&&nodes[0] instanceof Element&&nodes[0].tagName==='BR')return [];return nodes.flatMap(n=>inline(n));}
 function visit(el:Element):NoteBlock[]{
  if(['UL','OL'].includes(el.tagName))return Array.from(el.children).flatMap(li=>{if(li.tagName!=='LI'){failed=true;return [];}return [{type:el.tagName==='UL'?'bulletListItem':'numberedListItem',content:content(li),children:Array.from(li.children).filter(n=>['UL','OL'].includes(n.tagName)).flatMap(visit)}];});
  if(!['P','H1','H2','H3','BLOCKQUOTE'].includes(el.tagName)){failed=true;return [];}
  const todo=el.getAttribute('data-editor-todo'),type=todo!==null?'checkListItem':el.tagName==='BLOCKQUOTE'?'quote':el.tagName.startsWith('H')?'heading':'paragraph';
  return [{type,props:todo!==null?{checked:todo==='true'}:type==='heading'?{level:Number(el.tagName[1])}:{},content:content(el)}];
 }
 if(Array.from(root.childNodes).some(n=>n.nodeType===3&&n.textContent?.trim()))return null;
 const blocks=Array.from(root.children).flatMap(visit);return !failed&&(blocks.length===0||validNoteBlocks(blocks))?(blocks.length?blocks:[{type:'paragraph',content:[]}]):null;
}
