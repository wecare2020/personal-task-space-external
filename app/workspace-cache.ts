// Never adopt the original app's unscoped cache or another account's drafts.
export function workspaceScope(){
 const owner=typeof document==='undefined'?'':document.body?.dataset.workspaceId||'';
 return /^[a-f0-9]{64}$/.test(owner)?owner:'anonymous';
}
function scopedStorage(kind:'localStorage'|'sessionStorage'){
 const storage=()=>{if(typeof window==='undefined')throw Error('Browser storage is unavailable.');return window[kind];};
 const prefix=()=>`personal-task-space:account:${workspaceScope()}:`;
 return {
  getItem:(key:string)=>storage().getItem(prefix()+key),
  setItem:(key:string,value:string)=>storage().setItem(prefix()+key,value),
  removeItem:(key:string)=>storage().removeItem(prefix()+key),
  keys:()=>Object.keys(storage()).filter(key=>key.startsWith(prefix())).map(key=>key.slice(prefix().length)),
 };
}
export const accountLocalStorage=scopedStorage('localStorage');
export const accountSessionStorage=scopedStorage('sessionStorage');

// Pin each tab's API traffic to the account that rendered its document. If a
// second tab signs into another account, the server rejects this stale tab.
export function workspaceFetch(input:RequestInfo|URL,init?:RequestInit){
 const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
 const url=new URL(input instanceof Request?input.url:String(input),location.origin);
 const owner=workspaceScope();
 if(url.origin===location.origin&&url.pathname.startsWith('/api/')&&owner!=='anonymous')headers.set('x-workspace-id',owner);
 return fetch(input,{...init,headers});
}
