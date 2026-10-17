import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const root=new URL('../',import.meta.url);
const bundled=await build({stdin:{contents:"export {default} from './app/settings/settings';export {DEFAULT_TASK_PREFERENCES} from './app/task-preferences';export * from './app/settings/settings-config';export {hasConfigReference} from './app/settings/config-reference';export {default as ConfigReference} from './app/settings/config-reference';",resolveDir:new URL('.',root).pathname.replace(/^\/([A-Z]:)/,'$1')},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react/jsx-runtime']});
const module={exports:{}};vm.runInNewContext(bundled.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url)});
const {DEFAULT_TASK_PREFERENCES}=module.exports;
test('Personal settings uses the Config hierarchy and title-command-form anatomy',()=>{
 const html=renderToStaticMarkup(React.createElement(module.exports.default,{initial:{revision:3,preferences:DEFAULT_TASK_PREFERENCES},account:{name:'Owner',email:'owner@example.test'}}));
 assert.ok(html.indexOf('Business setting')<html.indexOf('App setting'));
 for(const label of ['General','Project info','PM','Step','Report','Metric','Report planning','Task Setting','Task list','New task defaults','Task types','Task Form','Data','Table index','Data column','Relationship','Connector','UI','Page','View','Form','Component','Navigation','App config','Service','Data services','App setting permission','Back to app','Storage &amp; backup','Account &amp; API'])assert.ok(html.includes(label),label);
 assert.ok(html.indexOf('>General<')<html.indexOf('>Report<'));assert.ok(html.indexOf('>Report<')<html.indexOf('>Task Setting<'));assert.ok(html.indexOf('>Data<')<html.indexOf('>UI<'));assert.ok(html.indexOf('>UI<')<html.indexOf('>Service<'));
 assert.ok(html.indexOf('id="settings-title"')<html.indexOf('class="settings-actions"'));assert.ok(html.indexOf('class="settings-actions"')<html.indexOf('class="settings-card"'));
 assert.ok(html.includes('role="combobox"'));assert.ok(html.includes('settings-panel-toggle'));assert.ok(html.includes('Settings navigation'));assert.ok(!html.includes('A calmer workspace'));
});
test('all UI Config items are retained exactly once and belong to a valid section / group',()=>{
 const {SETTINGS_SECTIONS,SETTINGS_ITEMS,settingParent,TASK_SETTING_CATEGORY,hasConfigReference}=module.exports;
 const groups=SETTINGS_SECTIONS.flatMap(section=>section.groups),ids=groups.flatMap(group=>group.items);
 assert.deepEqual(Array.from(groups,group=>group.title),['General','Report','Task Setting','Data','UI','Service']);assert.equal(ids.length,27);assert.equal(new Set(ids).size,27);assert.deepEqual(new Set(ids),new Set(Object.keys(SETTINGS_ITEMS)));
 for(const id of ids){assert.ok(groups.some(group=>group.id===settingParent(id).group&&group.items.includes(id)));assert.ok(TASK_SETTING_CATEGORY[id]||hasConfigReference(id)||['storage','access'].includes(id),id);}
 assert.deepEqual(Array.from(groups[2].items),['task-list','task-defaults','task-groups','task-types','task-attributes','task-type-attributes','task-form','text-editor']);
});
test('old setting links and disclosure state migrate without erasing native task preferences',()=>{
 const {settingFromQuery,restoredSettingsBranches}=module.exports;
 for(const [old,next] of [['list','task-list'],['new','task-defaults'],['types','task-types'],['form','task-form'],['storage','storage'],['access','access'],['relationship','relationship']])assert.equal(settingFromQuery(old),next);
 for(const value of [null,'__proto__','constructor','not-a-setting'])assert.equal(settingFromQuery(value),undefined);
 assert.deepEqual(Array.from(restoredSettingsBranches(['business','tasks','tasks','ui',false,'unknown'])),['business','task-setting','ui']);
});
test('non-native configuration is read-only reference and cannot trigger writes or grant permissions',()=>{
 const {SETTINGS_ITEMS,hasConfigReference,ConfigReference}=module.exports;
 for(const item of Object.keys(SETTINGS_ITEMS).filter(hasConfigReference)){
  const html=renderToStaticMarkup(React.createElement(ConfigReference,{item,onSelect:()=>{}}));assert.match(html,/readonly=""/i,item);assert.ok(!html.includes('type="submit"'));assert.ok(!html.includes('role="switch"'));
 }
 const source=readFileSync(new URL('app/settings/config-reference.tsx',root),'utf8');for(const forbidden of ['fetch(','localStorage','sessionStorage','/api/'])assert.ok(!source.includes(forbidden),forbidden);
 const settings=readFileSync(new URL('app/settings/settings.tsx',root),'utf8');assert.ok(settings.includes('Task Setting · Unsaved changes'));assert.ok(settings.includes('hidden={!TASK_SETTING_CATEGORY[item]}'));
});
test('shared settings fields keep content mounted and no new writes are added to the presentation layer',()=>{
 const fields=readFileSync(new URL('app/settings/task-settings-fields.tsx',root),'utf8'),source=readFileSync(new URL('app/settings/settings.tsx',root),'utf8');
 assert.ok(fields.includes("from '@wecare2020/ph-core/tasks/react'"));
 const installed=readFileSync(new URL('./task-settings-fields.js',import.meta.resolve('@wecare2020/ph-core/tasks/react')),'utf8');
 for(const item of ['list','new','types','form'])assert.ok(installed.includes("hidden: item !== '"+item+"'")||installed.includes('hidden: item !== "'+item+'"'));

 assert.ok(!fields.includes('fetch('));assert.ok(source.includes('revision:saved.revision'));assert.ok(source.includes('beforeunload'));
 const css=readFileSync(new URL('app/settings/settings.css',root),'utf8');assert.ok(css.includes('276px minmax(0,1fr)'));assert.ok(css.includes('64px minmax(0,1fr)'));assert.ok(css.includes('@media(max-width:520px)'));
});
