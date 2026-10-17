import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Apps Script exposes top-level functions to Code.js and the hosted runtime.
  {files:['integrations/apps-script/**/*.js'],rules:{'@typescript-eslint/no-unused-vars':'off'}},
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
