# Emoji picker validation

- Automated source/regression suite: `node --test qa/*.test.mjs` — 121 passing.
- Browser DOM checks: 12 passing in the Codex in-app browser. Generate the module with `node qa/emit-editor-harness.mjs`, save its output as `qa/emoji-editor-generated.js`, then open `/qa/emoji-dom-check.html` on the local dev server. Do not commit the generated module.
- Real local app UI tested at 1280×900 and 390×844 with isolated local QA tasks; Sheet synchronization remained paused throughout.
- Verified: /emoji; :D and :) followed by Space; suggested result; search (English and common Vietnamese aliases); category layout; Escape unchanged; selection/caret; one-step Undo/Redo; continued typing; bold in the middle of a bullet; checkbox preservation; toggle title/body; switch row while picker is open; save and reload.
- Keyboard grid navigation moves focus and selection together; Enter chooses the focused emoji.
- No real Android keyboard was available. IME/paste exclusions are covered by source tests; native Android composition still requires device validation.
- Unicode 17.0 base emoji data is loaded only when the picker opens. No emoji network request, new package, schema migration, or sync change is required.
