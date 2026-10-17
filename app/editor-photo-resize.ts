import {useEffect, useRef, type RefObject} from 'react';

export function refreshPhotoControls(root:HTMLElement){
  root.querySelectorAll<HTMLElement>('figure[data-editor-media="image"]').forEach(figure=>{
    if(figure.querySelector('[data-photo-controls]'))return;
    const controls=document.createElement('div');controls.dataset.photoControls='';controls.contentEditable='false';
    for(const edge of ['left','right','top','bottom']){
      const handle=document.createElement('button');handle.type='button';handle.dataset.photoEdge=edge;
      handle.setAttribute('aria-label','Resize photo '+edge);handle.title='Drag to resize · Arrow keys to adjust';controls.appendChild(handle);
    }
    figure.appendChild(controls);
  });
}
export function photoControlMutation(record:MutationRecord){
  const element=record.target instanceof Element?record.target:record.target.parentElement;
  return !!element?.closest('[data-photo-controls]')||record.type==='childList'&&record.addedNodes.length>0&&Array.from(record.addedNodes).every(node=>node instanceof Element&&node.hasAttribute('data-photo-controls'))&&!record.removedNodes.length;
}

export function usePhotoResize(rootRef:RefObject<HTMLElement|null>,callbacks:{before:()=>boolean|void;commit:(figure:HTMLElement,width:number)=>void}){
  const current=useRef(callbacks);current.current=callbacks;const resizing=useRef(false);
  useEffect(()=>{
    const root=rootRef.current;if(!root)return;
    let drag:{figure:HTMLElement;id:number;x:number;y:number;width:number;height:number;edge:string;style:string;attribute:string|null;max:number}|null=null;
    let ignoreClick=false;
    const clamp=(width:number,max:number)=>Math.round(Math.max(Math.min(80,max),Math.min(max,width)));
    function finish(cancel=false){
      if(!drag)return;const state=drag;drag=null;resizing.current=false;
      if(cancel){state.figure.style.width=state.style;if(state.attribute===null)state.figure.removeAttribute('data-editor-width');else state.figure.dataset.editorWidth=state.attribute;}
      else {const width=Math.round(state.figure.getBoundingClientRect().width);state.figure.dataset.editorWidth=String(width);current.current.commit(state.figure,width);}
      resizing.current=false;root!.classList.remove('is-photo-resizing');if(root!.hasPointerCapture(state.id))root!.releasePointerCapture(state.id);
      ignoreClick=true;setTimeout(()=>{ignoreClick=false;},0);
    }
    function down(event:PointerEvent){
      const handle=(event.target as Element).closest<HTMLElement>('[data-photo-edge]');const figure=handle?.closest<HTMLElement>('figure[data-editor-media="image"]');
      if(!figure||!root!.contains(figure)||event.button!==0)return;
      event.preventDefault();event.stopPropagation();if(current.current.before()===false)return;
      const rect=figure.getBoundingClientRect(),image=figure.querySelector('img')!.getBoundingClientRect();
      drag={figure,id:event.pointerId,x:event.clientX,y:event.clientY,width:rect.width,height:image.height||rect.height,edge:handle!.dataset.photoEdge!,style:figure.style.width,attribute:figure.getAttribute('data-editor-width'),max:Math.min(2400,figure.parentElement!.clientWidth)};
      resizing.current=true;root!.classList.add('is-photo-resizing');root!.setPointerCapture(event.pointerId);
    }
    function move(event:PointerEvent){if(!drag||drag.id!==event.pointerId)return;event.preventDefault();const delta=drag.edge==='left'?drag.x-event.clientX:drag.edge==='right'?event.clientX-drag.x:(drag.edge==='top'?drag.y-event.clientY:event.clientY-drag.y)*drag.width/Math.max(1,drag.height);drag.figure.style.width=clamp(drag.width+delta,drag.max)+'px';}
    function up(event:PointerEvent){if(drag?.id===event.pointerId){event.preventDefault();event.stopPropagation();finish();}}
    function cancel(){finish(true);}
    function click(event:MouseEvent){if(ignoreClick||(event.target as Element).closest('[data-photo-controls]')){event.preventDefault();event.stopPropagation();}}
    function key(event:KeyboardEvent){
      if(drag&&event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(true);return;}
      const handle=(event.target as Element).closest('[data-photo-edge]'),figure=handle?.closest<HTMLElement>('figure');
      if(!figure||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();if(current.current.before()===false)return;
      const width=clamp(figure.getBoundingClientRect().width+(['ArrowLeft','ArrowUp'].includes(event.key)?-20:20),Math.min(2400,figure.parentElement!.clientWidth));
      figure.style.width=width+'px';figure.dataset.editorWidth=String(width);current.current.commit(figure,width);
    }
    root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',cancel);root.addEventListener('lostpointercapture',cancel);root.addEventListener('click',click,true);root.addEventListener('keydown',key,true);
    return()=>{cancel();root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',cancel);root.removeEventListener('lostpointercapture',cancel);root.removeEventListener('click',click,true);root.removeEventListener('keydown',key,true);};
  },[rootRef]);
  return resizing;
}
