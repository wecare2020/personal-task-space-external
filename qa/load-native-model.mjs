import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export function loadNativeModel(){const form={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/task-form-data.ts',import.meta.url),'utf8'),{compilerOptions:{target:9,module:1}}).outputText,{exports:form,URL});const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/data/model.ts',import.meta.url),'utf8'),{compilerOptions:{target:9,module:1}}).outputText,{exports,require:name=>{if(name==='../task-form-data')return form;throw Error('Unexpected import: '+name);}});return exports;}
