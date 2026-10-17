import TaskSpace from './task-space';
import {auth} from '../auth';
import {withWorkspace} from './data/github-workspace';
import {personalAccount} from './personal-account';
import {getPreferences} from './data/preferences';
export const dynamic='force-dynamic';

export default async function Home() {
  const session=await auth(),owner=session?.user?.ownerId;
  if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))return <main className="workspace-signin"><h1>Personal Task Space</h1><p>Your own tasks, notes and projects.</p><a href="/signin">Continue with GitHub</a></main>;
  return withWorkspace(owner,async()=><TaskSpace account={personalAccount(session?.user)} preferences={(await getPreferences()).preferences} />);
}
