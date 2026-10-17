'use client';
import {uploadTaskImage} from './image-upload';

import {useEffect, useRef, useState} from 'react';
import {IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PASTE_IMAGES, nativeImagePath} from './image-files';
import type {EditorMedia} from './editor-inserts';

type UploadJob = {
  files: {file: File; id: string; url?: string}[];
  insert: (images: EditorMedia[]) => boolean;
  controller: AbortController;
  running?: boolean;
};
type UploadState = {message: string; failed: boolean; retry?: boolean};
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useImagePaste(endpoint='/api/images') {
  const job = useRef<UploadJob | null>(null);
  const [state, setState] = useState<UploadState | null>(null);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (job.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      job.current?.controller.abort();
      job.current = null;
    };
  }, []);

  async function run(current: UploadJob) {
    if (current.running) return;
    current.running = true;
    const live = () => job.current === current && !current.controller.signal.aborted;
    try {
      for (let index = 0; index < current.files.length; index++) {
        if (!live()) return;
        const item = current.files[index];
        setState({message: 'Uploading image ' + (index + 1) + ' of ' + current.files.length + '…', failed: false});
        if (item.url) continue;
        const timeout = AbortSignal.timeout(180000);
        const path = await uploadTaskImage(item.file,{endpoint,id:item.id,signal:AbortSignal.any([current.controller.signal,timeout])});
        item.url = new URL(path, window.location.origin).href;
      }
      if (!live()) return;
      const images: EditorMedia[] = current.files.map(item => ({kind: 'image', url: item.url!}));
      // Let the keyboard finish composing before mutating its live editing surface.
      while (live() && !current.insert(images)) {
        setState({message: 'Image ready — finishing text input…', failed: false});
        await pause(100);
      }
      if (!live()) return;
      job.current = null;
      setState(null);
    } catch (error) {
      if (!live()) return;
      setState({message: error instanceof Error && error.name !== 'TimeoutError'
        ? error.message : 'Upload timed out. Please retry.', failed: true, retry: true});
    } finally { current.running = false; }
  }
  function start(files: File[], insert: UploadJob['insert']) {
    if (job.current) {
      setState(current => current && {...current, message: 'Finish or cancel the current image upload before pasting another.'});
      return;
    }
    const invalid = files.length > MAX_PASTE_IMAGES ? 'Paste up to 4 images at a time.'
      : files.some(file => file.size > MAX_IMAGE_BYTES) ? 'Each image must be 8 MB or smaller.'
      : files.some(file => !(IMAGE_TYPES as readonly string[]).includes(file.type)) ? 'Paste a PNG, JPEG, GIF or WebP image.'
      : files.some(file => !file.size) ? 'The image is empty.' : '';
    if (invalid) { setState({message: invalid, failed: true}); return; }
    const current: UploadJob = {files: files.map(file => ({file, id: crypto.randomUUID()})), insert, controller: new AbortController()};
    job.current = current;
    void run(current);
  }
  function cancel() { job.current?.controller.abort(); job.current = null; setState(null); }
  const node = state ? <div className="image-paste-status" role={state.failed ? 'alert' : 'status'}>
    <span>{state.message}</span>
    {state.retry && <button type="button" onClick={() => { const current = job.current; if (current) void run(current); }}>Retry</button>}
    <button type="button" onClick={cancel}>{state.failed ? 'Dismiss' : 'Cancel'}</button>
  </div> : null;
  return {start, node};
}
