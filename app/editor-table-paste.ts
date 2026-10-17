import DOMPurify from 'dompurify';
import {readEditorTable, tableMarkup, type EditorTable} from './editor-tables';
import {insertMediaAfterRow} from './editor-image-dom';

// Import data, never a source application's scripts, controls or CSS.
export function clipboardTableContent(data:Pick<DataTransfer,'getData'>):{html:string;tables:EditorTable[]}|null {
  const html=data.getData('text/html'),text=data.getData('text/plain').replace(/\r\n?/g,'\n');
  if (/<table[\s>]/i.test(html)) {
    const clean=String(DOMPurify.sanitize(html,{ALLOWED_TAGS:['table','thead','tbody','tfoot','tr','td','th','caption','p','div','br','span','strong','b','em','i','ul','ol','li','a'],ALLOWED_ATTR:['href','colspan','rowspan'],ALLOW_DATA_ATTR:false}));
    const doc=new DOMParser().parseFromString(clean,'text/html');
    const tables:EditorTable[]=[];
    for(const node of Array.from(doc.querySelectorAll('table')).filter(node=>!node.parentElement?.closest('table'))){
      const table=readEditorTable(node);if(!table)continue;
      table.id='table-'+crypto.randomUUID();tables.push(table);
      const holder=doc.createElement('div');holder.innerHTML=tableMarkup(table);
      const caption=node.querySelector(':scope > caption');
      if(caption?.textContent){const p=doc.createElement('p');p.textContent=caption.textContent;node.parentNode?.insertBefore(p,node);}
      node.replaceWith(...Array.from(holder.childNodes));
    }
    if(tables.length)return {html:doc.body.innerHTML,tables};
  }
  let rows:string[][]|null=null,header=false;
  if(text.includes('\t')) rows=readTsv(text);
  else {
    const lines=text.trim().split('\n');
    const cells=(line:string)=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(cell=>cell.trim().replace(/\\\|/g,'|'));
    if(lines.length>=2&&lines[0].includes('|')&&cells(lines[1]).every(cell=>/^:?-{3,}:?$/.test(cell))){rows=[cells(lines[0]),...lines.slice(2).map(cells)];header=true;}
  }
  if(!rows?.length||!rows.some(row=>row.length>1))return null;
  const width=Math.max(...rows.map(row=>row.length));rows.forEach(row=>{while(row.length<width)row.push('');});
  const table={id:'table-'+crypto.randomUUID(),header,rows};return {html:tableMarkup(table),tables:[table]};
}

// Sheets quotes cells containing tabs/newlines and escapes quotes as two quotes.
export function readTsv(text:string){
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'&&(quoted||!cell)){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(char==='\t'||char==='\n')){row.push(cell);cell='';if(char==='\n'){rows.push(row);row=[];}}
    else cell+=char;
  }
  if(cell||row.length||!text.endsWith('\n')){row.push(cell);rows.push(row);}return rows;
}

export function overlayTableCells(table:EditorTable,incoming:EditorTable,row:number,column:number):EditorTable {
  const height=Math.max(table.rows.length,row+incoming.rows.length),width=Math.max(table.rows[0].length,column+incoming.rows[0].length);
  const rows=Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>table.rows[r]?.[c]??''));
  incoming.rows.forEach((cells,r)=>cells.forEach((value,c)=>{rows[row+r][column+c]=value;}));return {...table,rows};
}

/** Split only the insertion row, retaining text before/after the selection. */
export function insertTableContent(root:HTMLElement,range:Range,html:string){
  range.deleteContents();
  const element=range.startContainer instanceof Element?range.startContainer:range.startContainer.parentElement;
  const row=element?.closest<HTMLElement>('p,li,h1,h2,h3,blockquote,summary');
  const holder=document.createElement('div');holder.innerHTML=html;
  const after=document.createElement('p');after.setAttribute('data-editor-compact','true');
  if(row&&root.contains(row)){
    const tail=range.cloneRange();tail.setEnd(row,row.childNodes.length);after.appendChild(tail.extractContents());
    if(!after.hasChildNodes())after.innerHTML='<br>';
    const nodes=[...Array.from(holder.childNodes),after];
    if(row.tagName==='SUMMARY'){const reference=row.nextSibling;nodes.forEach(node=>row.parentNode!.insertBefore(node,reference));}
    else {insertMediaAfterRow(root,row,nodes);if(!row.textContent&&!row.querySelector('img,table,details,ul,ol')){const parent=row.parentElement;row.remove();if(parent?.matches('ul,ol')&&!parent.children.length)parent.remove();}}
  }else{
    after.innerHTML='<br>';const fragment=document.createDocumentFragment();fragment.append(...Array.from(holder.childNodes),after);range.insertNode(fragment);
  }
  root.focus({preventScroll:true});const caret=document.createRange();caret.selectNodeContents(after);caret.collapse(true);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(caret);
}
