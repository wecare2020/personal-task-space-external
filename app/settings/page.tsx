import {auth} from '../../auth';
import {withWorkspace} from '../data/github-workspace';
import {Montserrat,Roboto} from 'next/font/google';
import {getPreferences} from '../data/preferences';
import {personalAccount} from '../personal-account';
import Settings from './settings';
import './settings.css';
const heading=Montserrat({subsets:['latin','vietnamese'],variable:'--settings-heading'});
const body=Roboto({subsets:['latin','vietnamese'],variable:'--settings-body'});
export const dynamic='force-dynamic';
export default async function Page(){const session=await auth(),owner=session?.user?.ownerId;if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))return <main className="workspace-signin"><h1>Workspace settings</h1><p>Sign in to open Settings.</p><a href="/signin?returnTo=%2Fsettings">Continue with GitHub</a></main>;return withWorkspace(owner,async()=><div className={`${heading.variable} ${body.variable}`}><Settings initial={await getPreferences()} account={personalAccount(session?.user)}/></div>);}
