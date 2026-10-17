import NextAuth, {type DefaultSession} from 'next-auth';
import GitHub from 'next-auth/providers/github';
import type {} from 'next-auth/jwt';
import {createHash} from 'node:crypto';

declare module 'next-auth' {
  interface Session { user: DefaultSession['user'] & {ownerId?:string}; }
}
declare module 'next-auth/jwt' {
  interface JWT { ownerId?:string; }
}

// GitHub numeric IDs are immutable; display names and email addresses are not.
export function githubOwnerId(id:unknown):string {
  if(typeof id!=='string'&&typeof id!=='number'||typeof id==='number'&&!Number.isSafeInteger(id)||!/^[1-9][0-9]{0,24}$/.test(String(id)))throw new Error('Invalid GitHub identity.');
  return createHash('sha256').update('github:'+String(id)).digest('hex');
}

export const {handlers,auth,signIn,signOut}=NextAuth({
  providers:[GitHub({authorization:{params:{scope:'read:user user:email'}}})],
  session:{strategy:'jwt',maxAge:30*24*60*60},
  pages:{signIn:'/signin'},
  callbacks:{
    async signIn({account,profile}){
      if(account?.provider!=='github'||!profile)return false;
      const allowed=(process.env.APP_ALLOWED_GITHUB_IDS||'').split(',').map(value=>value.trim()).filter(Boolean);
      return !allowed.length||allowed.includes(String(profile.id));
    },
    async jwt({token,account,profile}){
      if(account){
        if(account.provider!=='github'||!profile)return null;
        token.ownerId=githubOwnerId(profile.id);
      }
      // OAuth credentials are never persisted in the session JWT.
      delete token.access_token;delete token.refresh_token;delete token.id_token;
      return token;
    },
    async session({session,token}){
      if(session.user&&typeof token.ownerId==='string'&&/^[a-f0-9]{64}$/.test(token.ownerId))session.user.ownerId=token.ownerId;
      return session;
    },
  },
});
