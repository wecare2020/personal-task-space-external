# Basic table validation (2026-09-09)

- 136 Node regression tests pass, including table structure, safe markup, native schema 6 and Apps Script compatibility guards.
- 5 real DOM checks pass: multiline/empty-cell round trip, toggle/callout/column ownership, transient-control removal, sanitizer, raw table import, surrounding rich text and AI context.
- Local in-app browser desktop: /table inserts 3 x 2; typing Vietnamese and Enter stays in cell; Tab advances and adds the last row; add/delete row/column Undo restores data; Escape writes below; Backspace there preserves table and paragraph. Reload retained all cells and multiline text.
- Local 390 px browser layout: table uses textareas; typed multiline Vietnamese, Tab, column change Undo, Backspace Undo, clipboard text paste Undo, Escape to next note line, /table insertion and document Undo all verified. No real Android IME keyboard was available.
- No production task content was changed for QA. Local fixture only; local Sheet sync remained paused.
- Native Sites schema 6 is published with this build. The Apps Script fallback guard is updated in source only; native background synchronization stores table HTML opaquely and needs no migration. Legacy original Apps Script UI is not claimed compatible.

To rerun DOM checks, emit qa/emit-editor-harness.mjs into a temporary qa/table-editor-generated.js and open qa/table-dom-check.html on the dev server. Do not package this generated test file.
