import type {ReactNode} from 'react';

export type LayoutRegion={id:string;kind:'callout'|'column';column?:number;count?:2|3;withinToggle?:string};
export type LayoutRow={layoutPath?:LayoutRegion[];togglePath?:string[]};
export type LayoutFrame={key:string;tag:'div'|'details';open:string};
const safeId=(value:string)=>/^[a-zA-Z0-9_-]{1,80}$/.test(value);
export function sameLayout(a:LayoutRow|undefined,b:LayoutRow|undefined){return JSON.stringify(a?.layoutPath||[])===JSON.stringify(b?.layoutPath||[]);}
export function rebaseLayoutToggle<T extends LayoutRow>(row:T,removed:string,replacement?:string):T{return {...row,layoutPath:row.layoutPath?.map(region=>region.withinToggle===removed?{...region,withinToggle:replacement}:region)};}
export function enclosingLayoutToggles(row:LayoutRow,region:LayoutRegion){const path=row.togglePath||[];return region.withinToggle?path.slice(0,path.indexOf(region.withinToggle)+1):[];}
// Wrap native inline runs without losing marks or hard breaks. Formatting-only
// whitespace between block tags is not an intentional blank paragraph.
export function layoutContentBlocks(node:Element):Element[]{const doc=node.ownerDocument;const blocks:Element[]=[];let inline:HTMLParagraphElement|null=null;for(const child of Array.from(node.childNodes)){if(child.nodeType===3&&!inline&&!child.textContent?.trim())continue;if(child.nodeType===1&&/^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL|DETAILS|FIGURE|HR)$/.test((child as Element).tagName)){inline=null;blocks.push(child as Element);}else if(child.nodeType===1||child.nodeType===3){if(!inline){inline=doc.createElement('p');inline.setAttribute('data-editor-compact','true');blocks.push(inline);}inline.appendChild(child.cloneNode(true));}}if(!blocks.length){const p=doc.createElement('p');p.setAttribute('data-editor-compact','true');p.innerHTML='<br>';blocks.push(p);}return blocks;}
export function layoutFrames(row:LayoutRow):LayoutFrame[]{
  const result:LayoutFrame[]=[];const toggles=row.togglePath||[];let depth=0;
  const addToggles=(until:number)=>{while(depth<until){const id=toggles[depth++];result.push({key:'toggle:'+id,tag:'details',open:''});}};
  for(const region of row.layoutPath||[]){addToggles(region.withinToggle?Math.max(depth,toggles.indexOf(region.withinToggle)+1):depth);if(!safeId(region.id))continue;
    if(region.kind==='callout')result.push({key:'callout:'+region.id,tag:'div',open:`<div data-editor-callout="${region.id}">`});
    else if((region.count===2||region.count===3)&&region.column&&region.column<=region.count){result.push({key:'columns:'+region.id,tag:'div',open:`<div data-editor-columns="${region.count}" data-layout-id="${region.id}">`});result.push({key:'column:'+region.id+':'+region.column,tag:'div',open:`<div data-editor-column="${region.column}">`});}
  }
  addToggles(toggles.length);return result;
}
export function layoutMarkup(kind:'callout'|'columns2'|'columns3',id:string){
  if(!safeId(id))return '';const paragraph='<p data-editor-compact="true"><br></p>';
  if(kind==='callout')return `<div data-editor-callout="${id}">${paragraph}</div>`;
  const count=kind==='columns3'?3:2;return `<div data-editor-columns="${count}" data-layout-id="${id}">${Array.from({length:count},(_,i)=>`<div data-editor-column="${i+1}">${paragraph}</div>`).join('')}</div>`;
}
export function normalizeLayoutDom(doc:Document){
  const ids=new Set<string>();let serial=0;const idFor=(value:string)=>{let id=safeId(value)?value:`layout-${++serial}`;while(ids.has(id))id+='x';ids.add(id);return id;};
  const blank=()=>{const p=doc.createElement('p');p.setAttribute('data-editor-compact','true');p.innerHTML='<br>';return p;};
  doc.body.querySelectorAll<HTMLElement>('[data-editor-callout],[data-editor-columns],[data-editor-column],[data-layout-id]').forEach(node=>{
    if(node.tagName!=='DIV'){['data-editor-callout','data-editor-columns','data-editor-column','data-layout-id'].forEach(attr=>node.removeAttribute(attr));return;}
    if(node.hasAttribute('data-editor-callout')){node.setAttribute('data-editor-callout',idFor(node.getAttribute('data-editor-callout')||''));node.removeAttribute('data-editor-columns');node.removeAttribute('data-editor-column');node.removeAttribute('data-layout-id');if(!node.childNodes.length)node.appendChild(blank());}
    else if(node.hasAttribute('data-editor-columns')){const count=node.getAttribute('data-editor-columns');if(count!=='2'&&count!=='3'){node.removeAttribute('data-editor-columns');node.removeAttribute('data-layout-id');return;}node.setAttribute('data-layout-id',idFor(node.getAttribute('data-layout-id')||''));node.removeAttribute('data-editor-column');const cols=Array.from(node.children).filter(child=>child.tagName==='DIV'&&child.hasAttribute('data-editor-column'));while(cols.length<Number(count)){const col=doc.createElement('div');col.appendChild(blank());node.appendChild(col);cols.push(col);}Array.from(node.childNodes).filter(child=>!cols.includes(child as Element)).forEach(child=>cols[0].appendChild(child));cols.forEach((col,i)=>{if(i<Number(count)){col.setAttribute('data-editor-column',String(i+1));if(!col.childNodes.length)col.appendChild(blank());}else{while(col.firstChild)cols[Number(count)-1].appendChild(col.firstChild);col.remove();}});}
    else{node.removeAttribute('data-layout-id');if(!node.parentElement?.hasAttribute('data-editor-columns')||!['1','2','3'].includes(node.getAttribute('data-editor-column')||''))node.removeAttribute('data-editor-column');}
  });
}
// Keep one editor and one undo history. Only the visual wrappers are grouped.
export function renderLayoutRows<T extends LayoutRow>(rows:T[],render:(row:T,index:number)=>ReactNode,visible:(row:T)=>boolean=()=>true):ReactNode[]{
  function group(indices:number[],depth:number):ReactNode[]{const output:ReactNode[]=[];for(let p=0;p<indices.length;){const index=indices[p],region=rows[index].layoutPath?.[depth];if(!region){output.push(render(rows[index],index));p++;continue;}let end=p+1;while(end<indices.length){const next=rows[indices[end]].layoutPath?.[depth];if(!next||next.id!==region.id||next.kind!==region.kind)break;end++;}const members=indices.slice(p,end);
    if(region.kind==='callout')output.push(<div key={'callout:'+region.id} className="mobile-editor-callout">{group(members,depth+1)}</div>);
    else output.push(<div key={'columns:'+region.id} className="mobile-editor-columns">{Array.from({length:region.count||2},(_,i)=><div key={i} className="mobile-editor-column"><div className="mobile-column-label">Column {i+1}</div>{group(members.filter(n=>rows[n].layoutPath?.[depth].column===i+1),depth+1)}</div>)}</div>);
    p=end;
  }return output;}return group(rows.map((_,i)=>i).filter(i=>visible(rows[i])),0);
}
