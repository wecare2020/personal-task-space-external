'use client';
import {uploadTaskImage} from './image-upload';
import {usePhBlockNote,PhBlockNoteView} from '@wecare2020/ph-core/ui/richtext';
import '@blocknote/ariakit/style.css';
import '@wecare2020/ph-core/ui/richtext/styles.css';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {noteEnvelope,validNoteBlocks,readNoteEnvelope,type NoteBlock} from './blocknote-document';
import {importLegacyNote} from './blocknote-import';
import {IMAGE_TYPES,MAX_IMAGE_BYTES,nativeImagePath} from './image-files';
import type {NoteEditorProps} from './task-text-editor';
import './blocknote-editor.css';
export default function BlockNoteEditor({initialBlocks,...props}:NoteEditorProps&{initialBlocks?:NoteBlock[]}){
 const callbacks=useRef(props);callbacks.current=props;
 const [error,setError]=useState(''),[uploading,setUploading]=useState(false),[prepared,setPrepared]=useState(!!initialBlocks);
 const original=useRef(props.html),lastPublished=useRef(props.html),serialized=useRef(props.html),changed=useRef(false),composing=useRef(false),dirty=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),alive=useRef(true),uploads=useRef(new Set<AbortController>());
 const applying=useRef(false),initialized=useRef(!!initialBlocks);
 const editor=usePhBlockNote({initialContent:(initialBlocks||[{type:'paragraph',content:[]}]) as never,uploadFile:async(file:File)=>{
  if(!(IMAGE_TYPES as readonly string[]).includes(file.type)||file.size>MAX_IMAGE_BYTES)throw Error('Choose a PNG, JPEG, GIF or WebP image, up to 8 MB.');
  const controller=new AbortController();uploads.current.add(controller);setUploading(true);setError('');
  try{return await uploadTaskImage(file,{endpoint:callbacks.current.imageEndpoint||'/api/images',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])});
  }catch(reason){if(alive.current)setError(reason instanceof Error?reason.message:'Image upload failed.');throw reason;}
  finally{uploads.current.delete(controller);if(alive.current)setUploading(uploads.current.size>0);}
 }},[]);
 function snapshot(){
  if(!changed.current)return serialized.current;
  const blocks=JSON.parse(JSON.stringify(editor.document)) as NoteBlock[];
  if(!validNoteBlocks(blocks))throw Error('This format could not be saved safely. Keep the tab open and copy your latest edits.');
  const html=noteEnvelope(blocks);if(html.length>1000000)throw Error('This note is too large to save. Keep this tab open and split it into smaller notes.');
  serialized.current=html;changed.current=false;return html;
 }
 const snapshotFn=useRef(snapshot);snapshotFn.current=snapshot;
 function publish(save=false){if(composing.current)return;try{const html=snapshotFn.current();lastPublished.current=html;(save?callbacks.current.onSave:callbacks.current.onDraft)(html);setError('');}catch(reason){setError(reason instanceof Error?reason.message:'Your edits could not be saved.');}}
 useLayoutEffect(()=>{if(initialized.current)return;try{const blocks=importLegacyNote(original.current,html=>editor.tryParseHTMLToBlocks(html) as NoteBlock[]);applying.current=true;try{editor.transact(tr=>{tr.setMeta('addToHistory',false);editor.replaceBlocks(editor.document,blocks as never);});}finally{applying.current=false;}initialized.current=true;changed.current=true;dirty.current=true;callbacks.current.onDirty();publish();setPrepared(true);}catch(reason){setError(reason instanceof Error?reason.message:'This note could not be converted safely. Your saved content is unchanged.');}},[editor]);
 useLayoutEffect(()=>{const read=()=>snapshotFn.current();props.snapshotRef.current=read;return()=>{if(props.snapshotRef.current===read)props.snapshotRef.current=null;};},[props.snapshotRef]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);uploads.current.forEach(controller=>controller.abort());if(dirty.current){try{callbacks.current.onDraft(snapshotFn.current());}catch{/* Keep the existing persisted draft; never substitute empty HTML. */}}};},[]);
 useEffect(()=>{const envelope=readNoteEnvelope(props.html);if(envelope&&JSON.stringify(envelope.blocks)===JSON.stringify(editor.document)){serialized.current=props.html;lastPublished.current=props.html;changed.current=false;dirty.current=false;return;}if(props.html===lastPublished.current||props.html===original.current||dirty.current||composing.current||editor.isFocused())return;let blocks:NoteBlock[];try{blocks=envelope?.blocks??importLegacyNote(props.html,html=>editor.tryParseHTMLToBlocks(html) as NoteBlock[]);}catch(reason){setError(reason instanceof Error?reason.message:'This note could not be converted safely.');return;}applying.current=true;try{editor.transact(tr=>{tr.setMeta('addToHistory',false);editor.replaceBlocks(editor.document,blocks as never);});}finally{applying.current=false;}original.current=props.html;serialized.current=props.html;lastPublished.current=props.html;changed.current=false;dirty.current=false;setPrepared(true);},[props.html,editor]);
 useEffect(()=>{if(!uploading)return;const leave=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[uploading]);
 return <div className="personal-blocknote-editor" data-editor-busy={uploading||undefined} onCompositionStart={()=>{composing.current=true;callbacks.current.onDirty();}} onCompositionEnd={()=>{composing.current=false;clearTimeout(timer.current);timer.current=setTimeout(()=>publish(),120);}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)&&dirty.current&&!uploading)publish(true);}}>
  {error&&<p className="blocknote-feedback" role="alert">{error}</p>}{uploading&&<p className="blocknote-feedback" role="status">Uploading image…</p>}
  <div hidden={!prepared}><PhBlockNoteView editor={editor} onChange={()=>{if(applying.current)return;changed.current=true;dirty.current=true;callbacks.current.onDirty();clearTimeout(timer.current);if(!composing.current)timer.current=setTimeout(()=>publish(),120);}}/></div>
 </div>;
}
