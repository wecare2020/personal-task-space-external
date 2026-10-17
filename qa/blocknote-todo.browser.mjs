async (page) => {
 const check=(value,message)=>{if(!value)throw Error(message);};
 await page.setViewportSize({width:1280,height:900});
 await page.goto('http://127.0.0.1:4174/qa/blocknote-preview.html');
 await page.waitForFunction(()=>!!window.__noteQA);
 const seed=async()=>{
  await page.evaluate(()=>{sessionStorage.removeItem('qa:preferences');sessionStorage.setItem('qa:note',__noteQA.bridge.noteEnvelope([{type:'paragraph',content:[]}]));});
  await page.reload();await page.locator('.personal-blocknote-editor [contenteditable=true]').waitFor();
  await page.locator('.personal-blocknote-editor [contenteditable=true]').click();
 };
 const queries=['','todo','to do','to-do','checkbox','checklist'];
 const matches=[];
 for(const query of queries){
  await seed();await page.keyboard.type('/'+query);
  const option=page.getByRole('option').filter({hasText:'To-do'});await option.waitFor();
  check(await option.count()===1,'duplicate To-do option for '+query);
  if(!query){check(await page.getByRole('option').filter({hasText:'Bullet List'}).count()===1,'native bullet option missing');await page.screenshot({path:'output/playwright/blocknote-todo-menu-20261012.png',fullPage:true});}
  await option.click();
  await page.locator('.personal-blocknote-editor [data-content-type=checkListItem]').waitFor();
  check(await page.locator('.personal-blocknote-editor input[type=checkbox]').count()===1,'native checkbox missing');
  matches.push(query||'(full menu)');
 }
 await page.keyboard.type('First to-do');
 const checkbox=page.locator('.personal-blocknote-editor input[type=checkbox]').first();await checkbox.check();
 await page.waitForFunction(()=>{const b=__noteQA.bridge.readNoteEnvelope(__noteQA.saved())?.blocks[0];return b?.type==='checkListItem'&&b.props.checked===true&&JSON.stringify(b.content).includes('First to-do');});
 await page.getByText('First to-do',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Second to-do');
 await page.waitForFunction(()=>{const b=__noteQA.bridge.readNoteEnvelope(__noteQA.saved())?.blocks;return b?.length===2&&b[1].type==='checkListItem'&&b[1].props.checked===false&&JSON.stringify(b[1].content).includes('Second to-do');});
 await page.reload();await page.getByText('Second to-do',{exact:true}).waitFor();
 const state=await page.locator('.personal-blocknote-editor input[type=checkbox]').evaluateAll(boxes=>boxes.map(box=>box.checked));check(JSON.stringify(state)==='[true,false]','refresh lost checkbox state');
 await page.setViewportSize({width:390,height:844});
 await page.locator('.personal-blocknote-editor input[type=checkbox]').first().uncheck();
 await page.waitForFunction(()=>__noteQA.bridge.readNoteEnvelope(__noteQA.saved())?.blocks[0].props.checked===false);
 await seed();await page.keyboard.type('/todo');
 await page.getByRole('option').filter({hasText:'To-do'}).waitFor();
 await page.screenshot({path:'output/playwright/blocknote-todo-mobile-20261012.png',fullPage:true});
 await page.getByRole('option').filter({hasText:'To-do'}).click();
 await page.locator('.personal-blocknote-editor [data-content-type=checkListItem]').waitFor();
 check(await page.locator('.personal-blocknote-editor input[type=checkbox]').count()===1,'mobile slash insertion failed');
 return {passed:['native To-do shown once in full slash menu','six queries insert native checkbox','tick state saves','Enter creates unchecked next item','text and check state survive refresh','mobile checkbox and slash menu work'],matches,state};
}
