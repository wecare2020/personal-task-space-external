import 'server-only';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

export type RoutedTokenKind='share'|'read';
const pattern=/^([a-f0-9]{64})\.([a-f0-9]{64})\.([a-f0-9]{64})$/;
function signingKey():string|null{
  const secret=process.env.AUTH_SECRET;
  return typeof secret==='string'&&Buffer.byteLength(secret,'utf8')>=32?secret:null;
}
function signature(owner:string,nonce:string,kind:RoutedTokenKind,key:string){
  return createHmac('sha256',key).update('ph-personal-route:v1:'+kind+':'+owner+'.'+nonce).digest();
}
// A signed routing hint rejects forged capabilities before touching GitHub.
// The snapshot still verifies token hash, permission, generation and expiry.
export function createRoutedToken(owner:string,kind:RoutedTokenKind):string{
  if(!/^[a-f0-9]{64}$/.test(owner)||!['share','read'].includes(kind))throw new Error('Invalid capability.');
  const key=signingKey();if(!key)throw new Error('Capability signing is not configured.');
  const nonce=randomBytes(32).toString('hex');
  return owner+'.'+nonce+'.'+signature(owner,nonce,kind,key).toString('hex');
}
export function routedTokenOwner(token:string,kind:RoutedTokenKind):string|null{
  if(typeof token!=='string'||!['share','read'].includes(kind))return null;
  const parts=pattern.exec(token),key=signingKey();if(!parts||!key)return null;
  const [,owner,nonce,mac]=parts;
  return timingSafeEqual(signature(owner,nonce,kind,key),Buffer.from(mac,'hex'))?owner:null;
}
