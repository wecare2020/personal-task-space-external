'use client';
import {Component,Suspense,lazy,useMemo,type ReactNode} from 'react';
import {readNoteEnvelope} from './blocknote-document';
import type {DetailSnapshot} from './task-space';
import './editor-loading.css';
export type NoteEditorProps={html:string;onDirty:()=>void;onDraft:(html:string)=>void;onSave:(html:string)=>void;snapshotRef:React.MutableRefObject<DetailSnapshot|null>;imageEndpoint?:string};
const BlockNoteEditor=lazy(()=>import('./blocknote-editor'));
class EditorBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?this.props.fallback:this.props.children;}}
export default function TaskTextEditor(props:NoteEditorProps){
 const envelope=useMemo(()=>readNoteEnvelope(props.html),[props.html]);
 return <EditorBoundary fallback={<p className="blocknote-feedback" role="alert">The editor could not open. Reload; your saved note is unchanged.</p>}><Suspense fallback={<div className="editor-loading" role="status">Opening text editor…</div>}><BlockNoteEditor {...props} initialBlocks={envelope?.blocks}/></Suspense></EditorBoundary>;
}
