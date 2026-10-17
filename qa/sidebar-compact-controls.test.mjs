import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../app/'+name,import.meta.url),'utf8');
test('no summary row or data button in view toolbar; reset remains accessible in Filter',()=>{const s=read('task-view-controls.tsx');assert.ok(!s.includes('className="task-view-summary"'));assert.ok(!s.includes('p.sheet')&&!s.includes('sheet:ReactNode'));assert.ok(s.includes('Reset all controls'));});
test('data lives under Gear and uses upward viewport-contained dialog without mount polling',()=>{assert.ok(read('task-space.tsx').includes('data={<SheetBackup menuItem/>}'));const f=read('personal-sidebar.tsx');assert.ok(f.includes('Task API</a>{data}</div>'));const b=read('sheet-backup.tsx');assert.ok(b.includes("bottom:window.innerHeight-rect.top+8"));assert.ok(b.includes("role=\"dialog\""));assert.match(b,/if\(!open\)return;\s*void refresh\(\)/);});
