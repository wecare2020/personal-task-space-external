async (page) => {
 const check=(value,message)=>{if(!value)throw Error(message);};
 await page.goto('http://127.0.0.1:4174/qa/blocknote-preview.html');
 const original=await page.evaluate(()=>{
  const text=(value,styles={})=>({type:'text',text:value,styles}),link=(value,styles={})=>({type:'link',href:'https://example.test/app',content:[text(value,styles)]});
  const blocks=[{type:'bulletListItem',content:[link('App')]},{type:'paragraph',content:[text('Normal text stays unchanged')]},{type:'bulletListItem',content:[link('Bold link',{bold:true})]},{type:'heading',props:{level:2},content:[link('Heading link')]},{type:'table',content:{type:'tableContent',headerRows:1,rows:[{cells:[[link('Table link')]]}]}}];
  const html=__noteQA.bridge.noteEnvelope(blocks);sessionStorage.removeItem('qa:preferences');sessionStorage.setItem('qa:note',html);return html;
 });
 await page.reload();await page.locator('.personal-blocknote-editor a[data-inline-content-type=link]').first().waitFor();
 const styles=await page.locator('.personal-blocknote-editor a[data-inline-content-type=link]').evaluateAll(links=>links.map(link=>{const style=getComputedStyle(link);return {text:link.textContent,color:style.color,line:style.textDecorationLine,thickness:style.textDecorationThickness,underlineColor:style.textDecorationColor,offset:style.textUnderlineOffset,cursor:style.cursor,href:link.getAttribute('href'),target:link.getAttribute('target'),rel:link.getAttribute('rel')};}));
 check(styles.length===4,'missing links');for(const style of styles){check(style.color==='rgb(79, 120, 161)',style.text+' color');check(style.line==='underline'&&style.thickness==='1px'&&style.offset==='2px',style.text+' underline');check(style.underlineColor==='rgb(182, 199, 216)',style.text+' subtle line');check(style.target==='_blank'&&style.rel.includes('noopener'),style.text+' click defaults');}
 const plain=await page.getByText('Normal text stays unchanged',{exact:true}).evaluate(el=>({color:getComputedStyle(el).color,line:getComputedStyle(el).textDecorationLine}));check(plain.color!=='rgb(79, 120, 161)'&&plain.line==='none','plain text changed');
 await page.screenshot({path:'output/playwright/blocknote-links-desktop-20261012.png',fullPage:true});
 await page.context().route('https://example.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>Synthetic link target</title><p>Link works</p>'}));
 const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'App',exact:true}).click();const popup=await popupPromise;await popup.waitForLoadState();check(popup.url()==='https://example.test/app','native click failed');await popup.close();
 check(await page.evaluate(original=>__noteQA.saved()===original&&__noteQA.writes()===0,original),'appearance change wrote note data');
 await page.setViewportSize({width:390,height:844});
 const mobile=await page.getByRole('link',{name:'App',exact:true}).evaluate(link=>({color:getComputedStyle(link).color,line:getComputedStyle(link).textDecorationLine,thickness:getComputedStyle(link).textDecorationThickness}));check(mobile.color===styles[0].color&&mobile.line==='underline'&&mobile.thickness==='1px','mobile style mismatch');
 await page.screenshot({path:'output/playwright/blocknote-links-mobile-20261012.png',fullPage:true});
 await page.reload();await page.getByRole('link',{name:'App',exact:true}).waitFor();check(await page.evaluate(original=>__noteQA.saved()===original&&__noteQA.writes()===0,original),'refresh changed stored note');
 return {passed:['native link style in bullet, bold, heading and table','plain text unchanged','native click opens target','no note writes on mount/click/refresh','mobile keeps subtle link styling'],styles,plain,mobile};
}
