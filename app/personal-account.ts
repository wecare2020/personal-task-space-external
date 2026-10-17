import type {PersonalAccount} from './personal-sidebar';
// Display data is supplied by a verified Auth.js session. Owner is also passed
// to the browser solely to namespace its cache; server authorization is separate.
export function personalAccount(user:{name?:string|null;email?:string|null;ownerId?:string}|undefined):PersonalAccount{
 const email=typeof user?.email==='string'?user.email:'';
 const name=typeof user?.name==='string'?user.name:'';
 return {name:name.trim()||email.split('@')[0]||'Account',email,...(user?.ownerId?{ownerId:user.ownerId}:{})};
}
