/* PH child-app adapter. Include in the CHILD app; no data access or auth changes. */
(() => {
 'use strict';
 if(window.parent===window || window.__phShellBridge) return;
 const script=document.currentScript;
 const allowedOrigin=new URL(script?.dataset.shellOrigin || 'https://ph-all-app.khoitran.chatgpt.site').origin;
 let connected=false,visible=true,lastURL='',poll,headerObserver,identity;
 const headerSelector='[data-ph-global-header],.global-header,[aria-label="Global header"]';
 const headerSamples='[data-ph-shell-keep-header],main,[role="main"],article,.anatomy-demo,.navigation-header-preview';
 const brandContainers='[data-ph-app-brand],.brand,.app-brand,.sidebar-brand,.rail-brand,.brand-lockup,.brand-copy,.brand-name,.brand-mark,.brand-abbr,.studio-brand,.studio-brand-mark,.global-brand,.global-product,.app-title,.sidebar-title';
 const keepBranding='[data-ph-shell-keep-branding],[data-ph-shell-keep-header],article,.record-header,.anatomy-demo,.navigation-header-preview,.logo-specimens,.type-specimens,table,[role="dialog"],[role="tabpanel"]';
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
 const inChrome=node=>!node.closest(keepBranding)&&!!node.closest(`header,aside,nav,[role="banner"],[role="navigation"],${brandContainers}`);
 const markDuplicate=(node,kind)=>{node.dataset.phShellDuplicate=kind;};
 const hasVisibleContent=node=>{
  if(node.nodeType===3)return !!node.textContent.trim();
  if(node.nodeType!==1 || node.dataset.phShellDuplicate || node.dataset.phShellHeader)return false;
  if(node.matches('img,svg,input,select,textarea,video,canvas,button,[role="button"]'))return true;
  return [...node.childNodes].some(hasVisibleContent);
 };
 const scanBranding=()=>{
  // Recompute markers so a router can reuse a title node for a different page.
  for(const node of document.querySelectorAll('[data-ph-shell-duplicate]'))node.removeAttribute('data-ph-shell-duplicate');
  if(!identity)return;
  const title=normalize(identity.appTitle),brands=[identity.brandName,...identity.brandAliases].map(normalize).filter(Boolean);
  const matchesText=value=>{
   const text=normalize(value);if(!text)return false;
   if(text===title || brands.includes(text))return true;
   return brands.some(brand=>text===brand+title || text===title+brand);
  };
  const duplicateLogo=node=>{
   if(node.hasAttribute('data-ph-brand-logo'))return true;
   if(brands.includes(normalize(node.getAttribute('alt')||node.getAttribute('aria-label')||node.getAttribute('title'))))return true;
   try{return !!identity.brandLogo&&new URL(node.getAttribute('src'),window.location.href).href===identity.brandLogo;}catch{return false;}
  };
  for(const node of document.querySelectorAll('img,[data-ph-brand-logo]'))if(inChrome(node)&&duplicateLogo(node))markDuplicate(node,'logo');
  for(const node of document.querySelectorAll(`${brandContainers},[data-ph-app-title],header h1,main h1,[role="main"] h1`)){
   if(node.closest(keepBranding)||node.closest('[data-ph-shell-header]'))continue;
   const heading=node.matches('h1,[data-ph-app-title]');
   if(heading){
    // App names can repeat in the page heading; record and section titles stay.
    if(title&&normalize(node.textContent)===title&&(node.hasAttribute('data-ph-app-title')||node.closest('header')||node===node.closest('main,[role="main"]')?.querySelector('h1')))markDuplicate(node,'title');
   }else if(inChrome(node)){
    if(matchesText(node.textContent)){
     if(node.querySelector('button,input,select,textarea,[role="button"]')){
      for(const label of node.querySelectorAll('h1,h2,span,strong,p'))if(matchesText(label.textContent)&&!label.closest('button,[role="button"]')&&!label.querySelector('button,input,select,textarea,[role="button"]'))markDuplicate(label,'title');
     }else markDuplicate(node,'title');
    }
    else if(node.matches('.brand-mark,.brand-abbr,.studio-brand-mark')&&brands.some(brand=>brand.startsWith('phuochung'))&&normalize(node.textContent)==='ph')markDuplicate(node,'logo');
   }
  }
  // Remove only empty branding/heading wrappers, preserving menus and actions.
  const wrappers=[...document.querySelectorAll(`${brandContainers},.page-header,.page-heading,[data-ph-app-heading]`)];
  for(const node of wrappers.reverse())if(!node.closest(keepBranding)&&(node.dataset.phShellDuplicate||node.querySelector('[data-ph-shell-duplicate]'))&&!hasVisibleContent(node))markDuplicate(node,'empty');
 };
 const scanHeaders=()=>{
  for(const header of document.querySelectorAll(headerSelector)){
   // Component examples and page/record headings belong to the child app.
   if(header.dataset.phShellHeader || header.closest(headerSamples))continue;
   const container=header.parentElement,layout=window.getComputedStyle(container);
   const rows=layout.gridTemplateRows.match(/[a-z-]+\([^)]*\)|\S+/g)||[];
   // Keep the grid item in a zero-height row so auto-placed panes retain their columns.
   const grid=layout.display==='grid' && rows.length===2 && container.firstElementChild===header;
   if(grid)container.dataset.phShellHeaderLayout='two-rows';
   header.dataset.phShellHeader=grid?'grid':'hidden';
   header.setAttribute('aria-hidden','true');header.inert=true;
  }
 };
 const detectHeaders=()=>{
  if(headerObserver || typeof document.querySelectorAll!=='function')return;
  const style=document.createElement('style');style.dataset.phShellChrome='';
  style.textContent=`
   html[data-ph-shell="embedded"] [data-ph-shell-header="hidden"]{display:none!important}
   html[data-ph-shell="embedded"] [data-ph-shell-header-layout="two-rows"]{grid-template-rows:0px minmax(0,1fr)!important}
   html[data-ph-shell="embedded"] [data-ph-shell-header="grid"]{height:0!important;min-height:0!important;max-height:0!important;padding:0!important;border:0!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important}
   html[data-ph-shell="embedded"] [data-ph-shell-duplicate]{display:none!important}
  `;
  (document.head||document.documentElement).appendChild(style);
  scanHeaders();scanBranding();
  let scheduled=false;
  headerObserver=new window.MutationObserver(()=>{
   if(scheduled)return;scheduled=true;
   window.queueMicrotask(()=>{scheduled=false;scanHeaders();scanBranding();});
  });
  headerObserver.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','aria-label','alt','src','title','data-ph-global-header','data-ph-app-title','data-ph-app-brand','data-ph-brand-logo','data-ph-shell-keep-branding']});
 };
 const send=(type,extra={})=>{if(connected)window.parent.postMessage({protocol:'ph-shell-v1',type,...extra},allowedOrigin);};
 const report=action=>{if(!connected)return;lastURL=window.location.href;send('ph:route-change',{url:lastURL,action});};
 const receive=event=>{
  if(event.source!==window.parent || event.origin!==allowedOrigin || event.data?.protocol!=='ph-shell-v1')return;
  if(event.data.type==='ph:shell-init'){
   connected=true;document.documentElement.dataset.phShell='embedded';
   identity=event.data.hideDuplicateBranding===true&&typeof event.data.appTitle==='string'&&typeof event.data.brandName==='string'?{appTitle:event.data.appTitle.slice(0,120),brandName:event.data.brandName.slice(0,120),brandAliases:Array.isArray(event.data.brandAliases)?event.data.brandAliases.filter(value=>typeof value==='string').slice(0,5):[],brandLogo:typeof event.data.brandLogo==='string'?event.data.brandLogo:''}:null;
   if(event.data.hideGlobalHeader!==false)detectHeaders();
   if(headerObserver)scanBranding();
   // Some app routers stop popstate propagation. Observe the URL as a backup.
   if(!poll)poll=window.setInterval(()=>{if(visible&&!document.hidden&&window.location.href!==lastURL)report('replace');},500);
   send('ph:ready');report('replace');
   window.dispatchEvent(new CustomEvent('ph:shell-connected',{detail:{appId:event.data.appId}}));
  }
  if(connected&&event.data.type==='ph:visibility'){visible=!!event.data.visible;if(visible)report('replace');window.dispatchEvent(new CustomEvent('ph:shell-visibility',{detail:{visible}}));}
 };
 window.addEventListener('message',receive);
 for(const [name,action] of [['pushState','push'],['replaceState','replace']]){
  const original=window.history[name];
  window.history[name]=function(...args){const result=original.apply(this,args);report(action);return result;};
 }
 window.addEventListener('popstate',()=>report('replace'),true);
 window.addEventListener('hashchange',()=>report('push'));
 window.__phShellBridge={reportRoute:()=>report('replace')};
 // Parent's init handshake may precede this script in lazy-loaded apps.
 window.parent.postMessage({protocol:'ph-shell-v1',type:'ph:hello'},allowedOrigin);
})();
