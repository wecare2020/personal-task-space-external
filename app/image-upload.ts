import {IMAGE_TYPES,MAX_IMAGE_BYTES,imageId,nativeImagePath} from './image-files';
import {workspaceFetch} from './workspace-cache';
const CHUNK_BYTES=2*1024*1024;
type Options={endpoint?:string;id?:string;signal?:AbortSignal};
export async function uploadTaskImage(file:File,{endpoint='/api/images',id=crypto.randomUUID(),signal}:Options={}){
  if(!(IMAGE_TYPES as readonly string[]).includes(file.type)||!file.size||file.size>MAX_IMAGE_BYTES||!imageId(id))throw new Error('Paste a PNG, JPEG, GIF or WebP image, 8 MB or smaller.');
  const credentials=endpoint==='/api/images'?'same-origin':'omit';
  async function send(headers:Record<string,string>,body?:BodyInit){
    const response=await (endpoint==='/api/images'?workspaceFetch:fetch)(endpoint,{method:'POST',credentials,referrerPolicy:'no-referrer',headers:{'content-type':file.type,'x-image-id':id,...headers},body,signal});
    const result=await response.json() as {ok?:boolean;error?:string;result?:{path?:string}};
    if(!response.ok||!result.ok)throw new Error(result.error||'Image upload failed. Try again.');return result.result;
  }
  let result:{path?:string}|undefined;
  if(file.size<=CHUNK_BYTES)result=await send({},file);
  else{
    const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),parts=Math.ceil(file.size/CHUNK_BYTES),headers={'x-image-size':String(file.size),'x-image-parts':String(parts),'x-image-sha256':hash};
    for(let part=0;part<parts;part++)await send({...headers,'x-image-upload':'chunk','x-image-part':String(part)},file.slice(part*CHUNK_BYTES,Math.min(file.size,(part+1)*CHUNK_BYTES),file.type));
    result=await send({...headers,'x-image-upload':'complete'});
  }
  const path=result?.path;
  if(typeof path!=='string'||!(endpoint==='/api/images'?nativeImagePath(path):path.startsWith(endpoint+'/')&&imageId(path.slice(endpoint.length+1))))throw new Error('The server returned an invalid image link.');
  return path;
}
