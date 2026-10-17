import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],define:{'process.env.NEXTAUTH_URL':'undefined','process.env.NEXTAUTH_URL_INTERNAL':'undefined','process.env.VERCEL_URL':'undefined'},server:{host:'127.0.0.1',port:4174,strictPort:true}});
