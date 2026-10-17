export type TreeNode={id:string;parentId:string;name:string;note:string;collapsed:boolean};
export type EditorTree={id:string;title:string;nodes:TreeNode[]};
export type TreeMove='before'|'after'|'inside';
export type TreeAction='child'|'sibling'|'root'|'indent'|'outdent'|'up'|'down'|'toggle'|'delete';
export const TREE_MAX_ITEMS=500;
export const TREE_MAX_DEPTH=12;
export const treeId=(value:string)=>/^[a-zA-Z0-9_-]{1,80}$/.test(value);
const newNode=(parentId=''):TreeNode=>({id:'n-'+crypto.randomUUID(),parentId,name:'',note:'',collapsed:false});
export function createEditorTree():EditorTree{return {id:'tree-'+crypto.randomUUID(),title:'Tree',nodes:[newNode()]};}
// Flat, stable records plus a parent relation. Never mutate an undo snapshot.
export function treeRows(tree:EditorTree,includeHidden=false){
  const children=new Map<string,TreeNode[]>();for(const node of tree.nodes){const group=children.get(node.parentId)||[];group.push(node);children.set(node.parentId,group);}
  const output:{node:TreeNode;depth:number;hidden:boolean;children:number}[]=[];
  const pending=(children.get('')||[]).slice().reverse().map(node=>({node,depth:0,hidden:false}));const seen=new Set<string>();
  while(pending.length){const row=pending.pop()!;if(seen.has(row.node.id))continue;seen.add(row.node.id);const kids=children.get(row.node.id)||[];if(includeHidden||!row.hidden)output.push({...row,children:kids.length});for(let i=kids.length-1;i>=0;i--)pending.push({node:kids[i],depth:row.depth+1,hidden:row.hidden||row.node.collapsed});}
  return output;
}
export function treeBranch(tree:EditorTree,id:string){const result=new Set([id]);const children=new Map<string,string[]>();for(const node of tree.nodes){const list=children.get(node.parentId)||[];list.push(node.id);children.set(node.parentId,list);}const pending=[id];while(pending.length){for(const child of children.get(pending.pop()!)||[])if(!result.has(child)){result.add(child);pending.push(child);}}return result;}
export function normalizeTree(tree:EditorTree):EditorTree{
  const used=new Set<string>();const nodes=tree.nodes.map((node,index)=>{let id=treeId(node.id)?node.id:'node-'+index;while(used.has(id))id+='x';used.add(id);return {...node,id,name:String(node.name||''),note:String(node.note||''),parentId:String(node.parentId||''),collapsed:node.collapsed===true};});
  const byId=new Map(nodes.map(node=>[node.id,node]));
  for(const node of nodes){if(!byId.has(node.parentId)||node.parentId===node.id)node.parentId='';const path=new Set([node.id]);let parent=byId.get(node.parentId);while(parent){if(path.has(parent.id)){node.parentId='';break;}path.add(parent.id);parent=byId.get(parent.parentId);}}
  const safe={id:treeId(tree.id)?tree.id:'tree-import',title:String(tree.title||''),nodes};return {...safe,nodes:treeRows(safe,true).map(row=>row.node)};
}
export function moveTreeNode(tree:EditorTree,id:string,targetId:string,position:TreeMove):EditorTree{
  const source=tree.nodes.find(node=>node.id===id),target=tree.nodes.find(node=>node.id===targetId);if(!source||!target)return tree;
  const branch=treeBranch(tree,id);if(branch.has(targetId))return tree;
  const rows=treeRows(tree,true),depth=new Map(rows.map(row=>[row.node.id,row.depth]));const newDepth=(depth.get(targetId)||0)+(position==='inside'?1:0);
  const height=Math.max(...rows.filter(row=>branch.has(row.node.id)).map(row=>row.depth))-(depth.get(id)||0);if(newDepth+height>TREE_MAX_DEPTH)return tree;
  const parentId=position==='inside'?target.id:target.parentId;
  const moving=tree.nodes.filter(node=>branch.has(node.id)).map(node=>node.id===id?{...node,parentId}:node);
  const remaining=tree.nodes.filter(node=>!branch.has(node.id));let index=remaining.findIndex(node=>node.id===targetId);
  if(position!=='before'){const targetBranch=treeBranch({...tree,nodes:remaining},targetId);while(index+1<remaining.length&&targetBranch.has(remaining[index+1].id))index++;index++;}
  remaining.splice(index,0,...moving);const next={...tree,nodes:remaining.map(node=>position==='inside'&&node.id===targetId?{...node,collapsed:false}:node)};
  return JSON.stringify(next)===JSON.stringify(tree)?tree:next;
}
export function changeTree(tree:EditorTree,action:TreeAction,id=''):{tree:EditorTree;focus:string}{
  const node=tree.nodes.find(row=>row.id===id);const siblings=tree.nodes.filter(row=>row.parentId===(node?.parentId||''));const siblingIndex=siblings.findIndex(row=>row.id===id);
  if(['root','child','sibling'].includes(action)){
    if(tree.nodes.length>=TREE_MAX_ITEMS||action!=='root'&&!node||action==='child'&&(treeRows(tree,true).find(row=>row.node.id===id)?.depth||0)>=TREE_MAX_DEPTH)return {tree,focus:id};
    const added=newNode(action==='child'?id:action==='sibling'?node!.parentId:'');const branch=treeBranch(tree,id);let index=action==='root'?tree.nodes.length:tree.nodes.findIndex(row=>row.id===id)+1;while(index<tree.nodes.length&&branch.has(tree.nodes[index].id))index++;
    const nodes=tree.nodes.map(row=>action==='child'&&row.id===id?{...row,collapsed:false}:row);nodes.splice(index,0,added);return {tree:{...tree,nodes},focus:added.id};
  }
  if(!node)return {tree,focus:id};
  if(action==='toggle')return {tree:{...tree,nodes:tree.nodes.map(row=>row.id===id?{...row,collapsed:!row.collapsed}:row)},focus:id};
  if(action==='delete'){const branch=treeBranch(tree,id);const nodes=tree.nodes.filter(row=>!branch.has(row.id));return {tree:{...tree,nodes},focus:nodes[Math.min(tree.nodes.findIndex(row=>row.id===id),nodes.length-1)]?.id||''};}
  if(action==='indent'&&siblingIndex>0)return {tree:moveTreeNode(tree,id,siblings[siblingIndex-1].id,'inside'),focus:id};
  if(action==='outdent'&&node.parentId)return {tree:moveTreeNode(tree,id,node.parentId,'after'),focus:id};
  if(action==='up'&&siblingIndex>0)return {tree:moveTreeNode(tree,id,siblings[siblingIndex-1].id,'before'),focus:id};
  if(action==='down'&&siblingIndex>=0&&siblingIndex<siblings.length-1)return {tree:moveTreeNode(tree,id,siblings[siblingIndex+1].id,'after'),focus:id};
  return {tree,focus:id};
}
export function treePlainText(tree:EditorTree){return [tree.title,...treeRows(tree,true).map(({node,depth})=>'  '.repeat(depth)+'- '+node.name+(node.note?' — '+node.note:''))].join('\n');}
