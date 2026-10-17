type ToggleRow={toggleId?:string;togglePath?:string[];layoutPath?:unknown[]};

export function toggleSubtreeEnd<T extends ToggleRow>(rows:T[],index:number){
  const id=rows[index]?.toggleId;let end=index+1;
  if(id)while(end<rows.length&&rows[end].togglePath?.includes(id))end++;
  return end;
}

// Move a row and its complete subtree. Unselected siblings keep their owner.
// This is only run for structural actions, never for ordinary text input.
export function moveToggleRows<T extends ToggleRow>(rows:T[],index:number,outdent:boolean):T[]|null{
  const row=rows[index];if(!row)return null;
  const path=row.togglePath||[];const end=toggleSubtreeEnd(rows,index);
  let nextPath:string[],destination:number;
  if(outdent){
    const owner=path.at(-1);if(!owner)return null;
    const ownerIndex=rows.findIndex(item=>item.toggleId===owner);if(ownerIndex<0)return null;
    if(JSON.stringify(rows[ownerIndex].layoutPath||[])!==JSON.stringify(row.layoutPath||[]))return null;
    nextPath=path.slice(0,-1);destination=toggleSubtreeEnd(rows,ownerIndex);
  }else{
    let previous=index-1;
    while(previous>=0&&(rows[previous].togglePath?.length||0)>path.length)previous--;
    const target=rows[previous];
    if(!target?.toggleId||JSON.stringify(target.togglePath||[])!==JSON.stringify(path)||JSON.stringify(target.layoutPath||[])!==JSON.stringify(row.layoutPath||[]))return null;
    nextPath=[...path,target.toggleId];destination=index;
    if(rows.slice(index,end).some(item=>nextPath.length+(item.togglePath?.length||0)-path.length+(item.toggleId?1:0)>8))return null;
  }
  const moved=rows.slice(index,end).map(item=>({...item,togglePath:[...nextPath,...(item.togglePath||[]).slice(path.length)]}));
  const result=rows.slice();result.splice(index,end-index);result.splice(destination>index?destination-(end-index):destination,0,...moved);
  return result;
}
