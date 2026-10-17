import {auth,signIn} from '../../auth';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';

function safeReturnTo(value:unknown):string {
  if(typeof value!=='string'||!/^\/(?!\/)/.test(value)||/[\\\u0000-\u001f\u007f]/.test(value))return '/';
  const url=new URL(value,'https://workspace.invalid');
  return url.origin==='https://workspace.invalid'&&['/','/settings','/api-access'].includes(url.pathname)?url.pathname+url.search:'/';
}

export default async function SignInPage({searchParams}:{searchParams:Promise<{returnTo?:string;error?:string}>}){
  const params=await searchParams,returnTo=safeReturnTo(params.returnTo);
  if((await auth())?.user?.ownerId)redirect(returnTo);
  const configured=!!(process.env.AUTH_GITHUB_ID&&process.env.AUTH_GITHUB_SECRET&&process.env.AUTH_SECRET);
  return <main className="workspace-signin"><h1>Personal Task Space</h1><p>Your own tasks, notes and projects.</p>{params.error&&<p role="alert">Sign-in could not be completed. Please try again.</p>}{configured?<form action={async()=>{'use server';await signIn('github',{redirectTo:returnTo});}}><button type="submit">Continue with GitHub</button></form>:<p role="status">GitHub sign-in is not configured yet.</p>}</main>;
}
