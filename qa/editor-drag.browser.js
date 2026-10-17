// Run through playwright-cli run-code --filename qa/editor-drag.browser.js.
// Uses native mouse/keyboard events; task reads/writes are isolated in memory.
async (page) => {
  const response=await page.request.get('http://127.0.0.1:4173/api/tasks');
  const data=(await response.json()).result;
  const id='task-editor-drag-recheck';
  let task={...data.tasks[0],id,title:'Isolated drag QA',completed:false,status:'today'};
  const saves=[];
  await page.route('**/api/tasks*',async route=>{
    if(route.request().method()==='GET'){
      await route.fulfill({json:{ok:true,result:{...data,tasks:[task]}}});return;
    }
    const body=route.request().postDataJSON();
    if(body.action!=='update'||body.id!==id){await route.abort();return;}
    task={...task,...body.updates};saves.push(body);
    await route.fulfill({json:{ok:true,result:task}});
  });
  const results=[];
  const fixture='<ul><li>Destination here.</li><li><strong>Move this text</strong><em> and italic</em> <a href="https://example.com">link</a> remaining source.</li><li>Last row.</li></ul>';
  async function prepare(html=fixture){
    task={...task,detail:html};saves.length=0;
    await page.goto('http://127.0.0.1:4173/?task='+id);
    const editor=page.getByRole('textbox',{name:'Edit task notes',exact:true});
    await editor.waitFor();
    await editor.evaluate(el=>{el.focus();window.dragEvents=[];for(const type of ['dragstart','dragover','drop','dragend'])el.addEventListener(type,event=>window.dragEvents.push({type,canceled:event.defaultPrevented,effect:event.dataTransfer?.dropEffect}));});
    return editor;
  }
  async function drag(editor,{blocked=false,copy=false,down=false,self=false,cancel=false,multi=false}={}){
    const before=await editor.innerHTML();
    const points=await editor.evaluate((el,options)=>{
      if(options.blocked)el.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='move';});
      const range=document.createRange(),strong=el.querySelector('strong'),link=el.querySelector('a');
      range.setStart(strong.firstChild,0);range.setEnd(link.firstChild,link.firstChild.length);
      if(options.multi)range.setEnd(el.querySelectorAll('li')[3].firstChild,el.querySelectorAll('li')[3].firstChild.length);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      const rect=range.getClientRects()[0];
      const target=options.down?el.lastElementChild.lastElementChild:el.firstElementChild.firstElementChild;
      const end=document.createRange();end.setStart(target.firstChild,target.firstChild.length);end.collapse(true);
      const dest=end.getBoundingClientRect();
      return {from:{x:rect.x+20,y:rect.y+rect.height/2},to:{x:dest.x-1,y:dest.y+dest.height/2}};
    },{blocked,down,multi});
    if(copy)await page.keyboard.down('Control');
    await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();
    await page.mouse.move(points.from.x+9,points.from.y,{steps:4});
    const end=self?{x:points.from.x+40,y:points.from.y}:points.to;
    await page.mouse.move(end.x,end.y,{steps:15});await page.mouse.move(end.x,end.y);
    if(cancel)await page.keyboard.press('Escape');
    await page.mouse.up();if(copy)await page.keyboard.up('Control');
    await page.waitForTimeout(180);
    const after=await editor.innerHTML();
    const events=await editor.evaluate(()=>window.dragEvents);
    if(!events.some(e=>e.type==='dragstart'))throw Error('Native drag did not start');
    return {before,after,events};
  }
  // Reproduce the exact previous regression in Chromium, at valid text coordinates.
  let editor=await prepare(),state=await drag(editor,{blocked:true});
  if(state.before!==state.after)throw Error('Old blocked-dragover regression not reproduced');
  results.push('previous blocked dragover: reproduced no movement');
  for(const options of [{},{down:true},{copy:true},{self:true},{cancel:true},{multi:true}]){
    editor=await prepare(options.multi?fixture.replace('<li>Last row.</li>','<li>Another selected row.</li><li>Third selected row.</li><li>Last row.</li>'):fixture);
    state=await drag(editor,options);
    const occurrences=(await editor.innerText()).split('Move this text').length-1;
    if(options.self||options.cancel){
      if(state.before!==state.after)throw Error('Canceled/self drop changed document');
    }else{
      if(state.before===state.after||occurrences!==(options.copy?2:1))throw Error('Move/copy result incorrect');
      if(!state.events.some(e=>e.type==='drop'&&!e.canceled))throw Error('Native drop was not allowed');
      await page.keyboard.press('Control+z');
      if(await editor.innerHTML()!==state.before)throw Error('One-step undo did not restore original');
      await page.keyboard.press('Control+Shift+z');
      if(await editor.innerHTML()!==state.after)throw Error('One-step redo did not restore move');
      await page.getByRole('textbox',{name:'Task title',exact:true}).click();
      await page.waitForTimeout(500);
      if(!saves.some(s=>s.updates?.detail))throw Error('Changed notes were not saved');
      await page.reload();await editor.waitFor();
      const reloaded=await editor.innerText();
      if(reloaded.split('Move this text').length-1!==occurrences)throw Error('Save/reload duplicated or lost text');
      if(await editor.locator('a').evaluateAll(links=>links.filter(a=>a.href==='https://example.com/').length)!==occurrences)throw Error('Hyperlink format lost '+JSON.stringify(options));
      if(!await editor.locator('strong,b').count()||!await editor.locator('em,i').count())throw Error('Inline marks lost after reload');
    }
    results.push(JSON.stringify(options)+' passed');
  }
  return {results,storage:'Mocked task API only; no real task or Sheet writes'};
}
