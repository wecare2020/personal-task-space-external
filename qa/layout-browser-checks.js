export async function runLayoutChecks(){
 const h=await import('/work/layout-browser-harness.js?layout-final');
 const p=text=>'<p data-editor-compact="true">'+text+'</p>';
 const call=(id,body)=>'<div data-editor-callout="'+id+'">'+body+'</div>';
 const cols=(id,bodies)=>'<div data-editor-columns="'+bodies.length+'" data-layout-id="'+id+'">'+bodies.map((body,i)=>'<div data-editor-column="'+(i+1)+'">'+body+'</div>').join('')+'</div>';
 const toggle=(id,body)=>'<details data-editor-toggle="'+id+'" open><summary>'+id+'</summary>'+body+'</details>';
 const fixtures=[
  ['all headers','<h1>One</h1><h2>Two</h2><h3>Three</h3>',['One','Two','Three']],
  ['callout inline marks',call('c',p('<strong>Bold</strong> <em>Italic</em> <a href="https://example.com">Link</a>')),['Bold','Italic','Link']],
  ['two columns',cols('c',[p('left'),p('right')]),['left','right']],
  ['three columns empty center',cols('c',[p('left'),p('<br>'),p('right')]),['left','right']],
  ['columns inside toggle',toggle('a',cols('c',[p('left'),call('d',p('right'))])),['a','left','right']],
  ['toggle inside column',cols('c',[toggle('a',call('d',p('inside'))),p('right')]),['a','inside','right']],
  ['alternating owners',toggle('a',cols('c',[toggle('b',call('d',p('inside'))),p('right')])),['a','b','inside','right']],
  ['mixed inline children',call('c','lead<strong>bold</strong>tail<p>next</p>'),['leadboldtail','next']],
  ['nested mixed DIV',call('c','<div>lead<p>middle</p>tail</div>'),['lead','middle','tail']],
  ['mixed toggle body',toggle('a','lead<p>middle</p>tail'),['a','lead','middle','tail']],
  ['independent numbered columns',cols('c',['<ol><li>A</li><li>B</li></ol>','<ol><li>C</li><li>D</li></ol>']),['A','B','C','D']],
  ['malformed missing column','<div data-editor-columns="3" data-layout-id="c"><div data-editor-column="1">'+p('keep')+'</div></div>',['keep']],
  ['empty callout',call('c',''),[]],
 ];
 const checks=fixtures.map(([name,html,words])=>{
  const normalized=h.normalizedDetailHtml(html);let result=normalized;
  for(let i=0;i<5;i++)result=h.normalizedDetailHtml(result);
  const blocks=h.readDetailBlocks(result),text=blocks.map(b=>b.text).join('|');
  if(result!==normalized||!words.every(word=>text.includes(word)))throw Error(name+' changed across save: '+result);
  const mobile=h.mobileBlocksFromDetail(blocks);const restored=h.detailHtmlFromBlocks(mobile);
  if(h.normalizedDetailHtml(restored)!==normalized)throw Error(name+' mobile roundtrip changed');
  return {name,stable:true,rows:blocks.length};
 });
 const unsafe=h.safeHtml(call('c','<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a>'));
 if(/script|onerror|javascript:/i.test(unsafe))throw Error('unsafe HTML retained');
 checks.push({name:'allowlist rejects script/events/javascript URL',stable:true});
 const marks=h.readDetailBlocks(h.normalizedDetailHtml(fixtures[1][1]))[0].html;
 if(!marks.includes('<strong>')||!marks.includes('<em>')||!marks.includes('https://example.com'))throw Error('inline format lost');
 const numbers=h.readDetailBlocks(h.normalizedDetailHtml(fixtures[10][1])).map(b=>b.listLabel);
 if(JSON.stringify(numbers)!==JSON.stringify(['1','2','1','2']))throw Error('columns share numbering '+numbers);
 const timings=[50,200,500].map(rows=>{const html=cols('perf',[Array.from({length:rows/2},(_,i)=>p('Tiếng Việt row '+i)).join(''),Array.from({length:rows/2},(_,i)=>p('<strong>Row '+i+'</strong>')).join('')]);const start=performance.now();h.normalizedDetailHtml(html);return {rows,ms:Math.round(performance.now()-start)};});
 return {checks,timings};
}
