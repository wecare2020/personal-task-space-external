import {importCustomerNote,noteUrl,validNoteBlocks,type NoteBlock,type NoteInline} from './blocknote-document';
type ParseNative=(html:string)=>NoteBlock[];
const text=(value:string):NoteInline=>({type:'text',text:value,styles:{}});
const blank=():NoteBlock=>({type:'paragraph',content:[],children:[]});
// The library owns HTML/inline-style/table parsing. This adapter only translates
// Customer 1's own structural markers that the library cannot recognize.
export function importLegacyNote(html:string,parseNative:ParseNative):NoteBlock[]{
 // Reuse the existing lossless fast bridge for simple notes; extended HTML uses
 // BlockNote's parser below. Conversion runs once, not on typing or every reload.
 const simple=importCustomerNote(html);if(simple)return simple;
 const doc=new DOMParser().parseFromString(html,'text/html');
 doc.querySelectorAll('script,style,template,svg,math,object,embed,form,input,button,textarea,select,option,noscript,base,link,meta,[data-photo-controls],[data-tree-controls],[data-table-controls],[data-todo-control],.ql-ui').forEach(node=>node.remove());
 doc.querySelectorAll('a[href]').forEach(node=>{if(!noteUrl(node.getAttribute('href')))node.removeAttribute('href');});
 function inline(el:Element){
  const clone=el.cloneNode(true) as Element;
  clone.querySelectorAll('ul,ol,details,figure,table,[data-editor-tree]').forEach(node=>node.remove());
  const p=doc.createElement('p');p.innerHTML=clone.innerHTML;
  for(const name of ['style','class'])if(el.hasAttribute(name))p.setAttribute(name,el.getAttribute(name)!);
  const blocks=parseNative(p.outerHTML),first=blocks[0]||blank();
  const content:NoteInline[]=[];blocks.forEach((block,index)=>{if(index)content.push(text('\n'));if(Array.isArray(block.content))content.push(...block.content);});
  // Native parsing may discard an entirely empty block; retain intentional spacing.
  if(p.innerHTML.toLowerCase()==='<br>'||!p.textContent&&!p.querySelector('a'))content.length=0;
  return {props:first.props||{},content};
 }
 function children(el:Element):NoteBlock[]{
  const result:NoteBlock[]=[];let run:Node[]=[];
  function flush(){if(!run.length)return;const p=doc.createElement('p');for(const node of run)p.appendChild(node.cloneNode(true));if(p.textContent?.trim()||p.querySelector('br,img,iframe,video'))result.push(...visit(p));run=[];}
  for(const node of Array.from(el.childNodes)){
   if(node instanceof Element&&/^(P|DIV|SECTION|ARTICLE|H[1-6]|BLOCKQUOTE|UL|OL|DETAILS|FIGURE|HR|TABLE|PRE|IMG|IFRAME|VIDEO)$/.test(node.tagName)){flush();result.push(...visit(node));}
   else run.push(node);
  }flush();return result;
 }
 function cellContent(blocks:NoteBlock[],depth=0):NoteInline[]{
  const result:NoteInline[]=[];
  blocks.forEach((block,index)=>{
   if(index)result.push(text('\n'));
   if(depth)result.push(text('  '.repeat(depth)));
   const prefix=block.type==='bulletListItem'?'• ':block.type==='numberedListItem'?`${block.props?.start||index+1}. `:block.type==='checkListItem'?(block.props?.checked?'☑ ':'☐ '):'';
   if(prefix)result.push(text(prefix));
   if(Array.isArray(block.content))result.push(...block.content);
   else if(block.type==='table'&&block.content){block.content.rows.forEach((row,r)=>{if(r)result.push(text('\n'));row.cells.forEach((cell,c)=>{if(c)result.push(text('\t'));result.push(...(Array.isArray(cell)?cell:cell.content));});});}
   else if(typeof block.props?.url==='string')result.push({type:'link',href:block.props.url,content:[text(String(block.props.caption||block.props.name||block.props.url))]});
   if(block.children?.length){result.push(text('\n'),...cellContent(block.children,depth+1));}
  });return result;
 }
 function tree(el:Element):NoteBlock[]{
  const rows=Array.from(el.querySelectorAll('[data-tree-node]')).filter(row=>row.closest('[data-editor-tree]')===el);
  const byParent=new Map<string,Element[]>(),ids=new Set(rows.map(row=>row.getAttribute('data-tree-node')||''));
  for(const row of rows){const parent=row.getAttribute('data-tree-parent')||'',key=ids.has(parent)&&parent!==row.getAttribute('data-tree-node')?parent:'';byParent.set(key,[...(byParent.get(key)||[]),row]);}
  const seen=new Set<Element>();
  function branch(parent:string,depth=0):NoteBlock[]{return (byParent.get(parent)||[]).flatMap(row=>{if(seen.has(row))return [];seen.add(row);const name=row.querySelector('[data-tree-field="name"]'),note=row.querySelector('[data-tree-field="note"]'),content=[...(name?inline(name).content:[])];if(note?.textContent)content.push(text('\n'),...inline(note).content);return [{type:'bulletListItem',content,children:depth<12?branch(row.getAttribute('data-tree-node')||'',depth+1):[]}];});}
  const title=el.querySelector('[data-tree-title]'),result:NoteBlock[]=title?[{type:'heading',props:{level:3,isToggleable:false},content:inline(title).content,children:[]}]:[];
  result.push(...branch(''));
  // Include malformed/orphaned rows rather than silently losing their fields.
  for(const row of rows)if(!seen.has(row)){const value=[row.querySelector('[data-tree-field="name"]')?.textContent,row.querySelector('[data-tree-field="note"]')?.textContent].filter(Boolean).join('\n');result.push({type:'bulletListItem',content:value?[text(value)]:[],children:[]});}
  return result;
 }
 function list(el:Element):NoteBlock[]{
  const roots:NoteBlock[]=[],stack:NoteBlock[]=[];
  Array.from(el.children).forEach((li,index)=>{
   if(li.tagName!=='LI'){roots.push(...visit(li));return;}
   const mode=li.getAttribute('data-list'),type=mode==='checked'||mode==='unchecked'?'checkListItem':mode==='bullet'?'bulletListItem':mode==='ordered'||el.tagName==='OL'?'numberedListItem':'bulletListItem';
   const data=inline(li),start=Number(li.getAttribute('value')||(index===0?el.getAttribute('start'):''));
   const block:NoteBlock={type,props:{...data.props,...(type==='checkListItem'?{checked:mode==='checked'}:{}),...(type==='numberedListItem'&&start>0?{start}:{})},content:data.content,children:Array.from(li.children).filter(child=>['UL','OL','DETAILS','FIGURE','TABLE'].includes(child.tagName)||child.hasAttribute('data-editor-tree')).flatMap(visit)};
   const requested=Number(/(?:^|\s)ql-indent-(\d+)/.exec(li.className)?.[1]||0)+Number(li.getAttribute('data-list-extra-indent')||0),depth=Math.min(12,Math.max(0,requested),stack.length);
   if(depth&&stack[depth-1])stack[depth-1].children!.push(block);else roots.push(block);
   stack[depth]=block;stack.length=depth+1;
  });return roots;
 }
 function visit(el:Element):NoteBlock[]{
  if(el.hasAttribute('data-editor-tree'))return tree(el);
  if(el.hasAttribute('data-editor-columns')){const columns=Array.from(el.children).filter(column=>column.hasAttribute('data-editor-column'));if(columns.length)return [{type:'table',content:{type:'tableContent',rows:[{cells:columns.map(column=>cellContent(children(column)))}]},children:[]}];}
  if(el.hasAttribute('data-editor-callout')){const blocks=children(el),first=blocks.shift()||blank();return [{type:'quote',props:{backgroundColor:'gray',textColor:'default'},content:Array.isArray(first.content)?first.content:cellContent([first]),children:[...(first.children||[]),...blocks]}];}
  if(el.tagName==='DETAILS'){const summary=Array.from(el.children).find(child=>child.tagName==='SUMMARY'),body=el.cloneNode(true) as Element;body.querySelector(':scope > summary')?.remove();const data=summary?inline(summary):{content:[],props:{}};return [{type:'toggleListItem',...data,children:children(body)}];}
  if(el.tagName==='UL'||el.tagName==='OL')return list(el);
  if(el.tagName==='HR')return [{type:'divider',children:[]}];
  if(el.hasAttribute('data-editor-table'))return children(el);
  if(el.tagName==='FIGURE'||el.tagName==='IMG'||el.tagName==='VIDEO'||el.tagName==='IFRAME'){
   const media=['IMG','VIDEO','IFRAME'].includes(el.tagName)?el:el.querySelector('img,video,iframe'),url=media?.getAttribute('src')||'';
   if(media&&noteUrl(url,true)){const image=media.tagName==='IMG',width=Number(el.getAttribute('data-editor-width'));return [{type:image?'image':'video',props:{url,name:image?(media.getAttribute('alt')||''):'',caption:el.querySelector('figcaption')?.textContent||'',showPreview:true,...(width>=80&&width<=2400?{previewWidth:width}:{})},children:[]}];}
   return el.textContent?.trim()?[{type:'paragraph',content:[text(el.textContent)],children:[]}]:[];
  }
  if(el.tagName==='DIV'||el.tagName==='SECTION'||el.tagName==='ARTICLE')return children(el);
  const todo=el.getAttribute('data-editor-todo');
  if(todo!==null){const data=inline(el);return [{type:'checkListItem',props:{...data.props,checked:todo==='true'},content:data.content,children:[]}];}
  const parsed=parseNative(el.outerHTML);
  if(!parsed.length)return [blank()];
  if(!el.textContent&&!el.querySelector('img,iframe,video,table')&&parsed.length===1&&Array.isArray(parsed[0].content))parsed[0].content=[];
  return parsed;
 }
 const blocks=children(doc.body);if(!blocks.length)blocks.push(blank());
 // The library represents unset widths as undefined; JSON storage uses null.
 const normalize=(list:NoteBlock[])=>list.forEach(block=>{if(block.content&&!Array.isArray(block.content)&&block.content.columnWidths)block.content.columnWidths=block.content.columnWidths.map(width=>width??null);if(block.children)normalize(block.children);});normalize(blocks);
 if(!validNoteBlocks(blocks))throw Error('This note could not be converted safely. Your saved content has not been changed.');
 return blocks;
}
