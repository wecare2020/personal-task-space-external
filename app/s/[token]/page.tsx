import SharedTask from '../../shared-task';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const metadata={title:'Shared task',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <SharedTask key={token} token={token}/>;}
