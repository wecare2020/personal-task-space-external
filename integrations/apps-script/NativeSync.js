// Native Sites bridge. No browser state or in-memory retry queue is authoritative.
function nativeComparable_(task) {
  if (!task) return 'null';
  return JSON.stringify(['title','detail','date','completed','status','isTop','team','projectIds'].map(function(key) { return [key, apiComparableField_(key,task[key])]; }));
}
function nativeRows_() {
  const sheet=getTaskSheet_();
  return sheet.getLastRow()<2?[]:sheet.getRange(2,1,sheet.getLastRow()-1,10).getValues();
}
function nativeSnapshot_(prepare) {
  const props=PropertiesService.getScriptProperties();
  let rows=nativeRows_();
  const seen={};
  rows.forEach(function(row,index){
    if(!String(row[0]||'').trim())return;
    const id=String(row[7]||'').trim()||(prepare?taskIdForRow_(row,index+2):'');
    if(id&&seen[id])throw new Error('Duplicate task IDs: repair the Sheet before synchronizing.');
    if(id)seen[id]=true;
  });
  if(prepare&&!props.getProperty('native:backup')) {
    const backup=getSpreadsheet_().copy('Personal Task Space - before native data - '+new Date().toISOString());
    props.setProperty('native:backup',backup.getId());
  }
  rows.forEach(function(row,index){
    if(!String(row[0]||'').trim()||String(row[7]||'').trim())return;
    const id=prepare?taskIdForRow_(row,index+2):'task-'+Utilities.getUuid();
    getTaskSheet_().getRange(index+2,8).setValue(id);row[7]=id;
  });
  SpreadsheetApp.flush();
  rows=nativeRows_();
  const tasks=[],deleted=[];const ids={};
  rows.forEach(function(row,index){
    const task=rowToTask_(row,index);if(!task)return;
    if(ids[task.id])throw new Error('Duplicate task IDs: synchronization paused.');ids[task.id]=true;
    if(booleanValue_(row[9]))deleted.push(task.id);else tasks.push(task);
  });
  return {tasks:tasks,deleted:deleted,projects:buildProjects_(getProjectNames_().concat(tasks.flatMap(function(t){return t.projectIds;}))),backupId:props.getProperty('native:backup'),at:Date.now()};
}
function nativeApply_(payload) {
  const rows=nativeRows_();const index=rows.findIndex(function(row){return String(row[7]||'')===payload.id;});
  if(rows.filter(function(row){return String(row[7]||'')===payload.id;}).length>1)throw new Error('Duplicate task ID: export stopped.');
  const current=index<0||booleanValue_(rows[index][9])?null:rowToTask_(rows[index],index);
  const desired=payload.desired;
  if(desired&&desired.id!==payload.id)throw new Error('Task ID mismatch.');
  if(!/^[-a-zA-Z0-9]{8,100}$/.test(String(payload.attemptId||'')))throw new Error('Invalid attempt ID.');
  const props=PropertiesService.getScriptProperties();const key='native:receipt:'+payload.attemptId;
  const digest=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([payload.id,payload.base,desired])));
  const receipt=props.getProperty(key);
  if(receipt&&JSON.parse(receipt).digest!==digest)throw new Error('Attempt ID already used.');
  if(nativeComparable_(current)===nativeComparable_(desired))return {task:current};
  if(receipt||nativeComparable_(current)!==nativeComparable_(payload.base))throw apiTaskError_('CONFLICT','Sheet changed before export.',current,['sheet']);
  const sheet=getTaskSheet_();
  if(!desired){if(index>=0){sheet.getRange(1,10).setValue('Sites deleted');sheet.getRange(index+2,10).setValue(true);}}
  else if(index<0){const number=sheet.getLastRow()+1;sheet.getRange(number,1,1,9).setValues([buildTaskSheetRow_(number,[],desired)]);}
  else {
    const next=buildTaskSheetRow_(index+2,rows[index],desired);
    if(String(rows[index][3]||'').toLowerCase()==='done'&&!desired.completed)sheet.getRange(index+2,4).setValue(next[3]);
    // Never rewrite unrelated cells (especially formulas in E).
    const mapping=[['title',1],['completed',2],['date',3],['status',4],['team',6],['detail',7],['projectIds',9]];
    mapping.forEach(function(pair){const field=pair[0],column=pair[1];if(!current||apiComparableField_(field,current[field])!==apiComparableField_(field,desired[field])||(field==='status'&&current.isTop!==desired.isTop))sheet.getRange(index+2,column).setValue(next[column-1]);});
    if(booleanValue_(rows[index][9]))sheet.getRange(index+2,10).setValue(false);
  }
  SpreadsheetApp.flush();
  props.setProperty(key,JSON.stringify({digest:digest,at:Date.now()}));
  const receipts=Object.entries(props.getProperties()).filter(function(p){return p[0].indexOf('native:receipt:')===0;});
  if(receipts.length>256)receipts.sort(function(a,b){return JSON.parse(a[1]).at-JSON.parse(b[1]).at;}).slice(0,receipts.length-256).forEach(function(p){props.deleteProperty(p[0]);});
  const check=nativeRows_();const found=check.findIndex(function(row){return String(row[7]||'')===payload.id;});
  return {task:found<0||booleanValue_(check[found][9])?null:rowToTask_(check[found],found)};
}
function configureNativeRunner_(payload) {
  const origin='https://personal-task-space-sheet.khoitran.chatgpt.site';
  if(payload.origin!==origin||!payload.bypassToken||!payload.syncSecret)throw new Error('Invalid runner configuration.');
  const props=PropertiesService.getScriptProperties();
  props.setProperties({'native:origin':origin,'native:bypass':payload.bypassToken,'native:secret':payload.syncSecret});
  installNativeRunner();
  return {configured:true};
}
// Run once in the Apps Script editor to authorize the added fetch/trigger scopes.
function installNativeRunner() {
  const triggers=ScriptApp.getProjectTriggers();
  if(!triggers.some(function(t){return t.getHandlerFunction()==='nativeSyncTick';}))ScriptApp.newTrigger('nativeSyncTick').timeBased().everyMinutes(1).create();
  if(!triggers.some(function(t){return t.getHandlerFunction()==='nativeSheetEdited';}))ScriptApp.newTrigger('nativeSheetEdited').forSpreadsheet(getSpreadsheet_()).onEdit().create();
}
function nativeSheetEdited(e) { if(e&&e.range&&[TASK_SHEET,PROJECT_SHEET].includes(e.range.getSheet().getName()))nativeSyncTick(true); }
function nativeSyncTick(forceRead) {
  // Do not hold ScriptLock while calling Sites: Sites may call this bridge back.
  const p=PropertiesService.getScriptProperties();const origin=p.getProperty('native:origin');if(!origin)return;
  const response=UrlFetchApp.fetch(origin+'/api/sync/run',{method:'post',contentType:'application/json',payload:JSON.stringify({reason:forceRead===true?'sheetEdit':'timer'}),headers:{'OAI-Sites-Authorization':'Bearer '+p.getProperty('native:bypass'),'X-Sync-Secret':p.getProperty('native:secret')},muteHttpExceptions:true,followRedirects:false});
  const status=response.getResponseCode();
  if(status!==200)throw new Error('Native synchronization runner HTTP '+status); // Never log task content or credentials.
}
