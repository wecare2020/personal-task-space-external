import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const source=readFileSync(new URL('../app/task-space.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('task-space.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let properties;
function visit(node){if(ts.isJsxElement(node)&&node.openingElement.attributes.getText(ast).includes('aria-label="Task properties"'))properties=node;ts.forEachChild(node,visit);}
visit(ast);
assert.ok(properties);
const updates=[];
const context={React,contextCopyFeedback:null,projectProperty:null,projectMenuOpen:false,selectedTitleDraft:null,mobileLayout:false,data:{projects:[]},preferences:{taskTypes:[]},taskProjectIds:()=>[],updateTask:patch=>updates.push(patch),Icon:()=>null,DatePicker:()=>React.createElement('span',null,'Due date'),TaskTypeProperty:()=>React.createElement('span',null,'Task type'),OtherProperties:()=>React.createElement('span',null,'Other properties')};
const compiled=ts.transpileModule(`function render(selected){return (${properties.getText(ast)});} globalThis.render=render;`,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(compiled,context);
const task={id:'test',title:'Regular task',isTop:false,completed:false,date:'',team:false,status:'today',projectId:''};

test('property row is not hidden for Top of mind documents',()=>{const parent=properties.parent;assert.ok(!ts.isBinaryExpression(parent)||!parent.left.getText(ast).includes('isTop'));assert.ok(!source.includes('top-task-detail'));});
for(const title of ['Overall','Next & Note'])test(title+' retains shared properties except Complete and Date',()=>{const html=renderToStaticMarkup(context.render({...task,title,isTop:true}));for(const label of ['AI context','AI agent planning','Solo','Today','Empty','Other properties'])assert.ok(html.includes(label),label);assert.ok(!html.includes('completion-property'));assert.ok(!html.includes('Due date'));});
test('regular tasks retain Complete and Date',()=>{const html=renderToStaticMarkup(context.render(task));assert.ok(html.includes('completion-property'));assert.ok(html.includes('Due date'));});
test('changing status never silently unpins Overall or Next & Note',()=>{const tree=context.render({...task,isTop:true});let status;function walk(node){if(!React.isValidElement(node))return;if(node.props.className?.includes('status-toggle'))status=node;React.Children.forEach(node.props.children,walk);}walk(tree);assert.ok(status);updates.length=0;status.props.onClick();assert.equal(updates.length,1);assert.equal(updates[0].status,'upcoming');assert.ok(!('isTop' in updates[0]));});
