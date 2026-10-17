# Toggle navigation follow-up

## Interaction contract

- Enter in a toggle title creates the next sibling toggle. Tab nests it under the preceding toggle; Shift+Tab moves a row/toggle out one level, retaining its subtree.
- Enter in toggle body text splits a genuine editable row. Enter on an empty body row exits one level. An empty toggle title can be turned back into text with Enter/Backspace.
- Shift+Enter keeps an inline line break; Ctrl/Cmd+Enter opens/closes a toggle title.
- Backspace at the start of body text can outdent without merging into the title.
- Slash supports subsequent paragraph/list/title rows and leading indentation whitespace. Title conversion preserves existing body content.
- Software-keyboard Enter is handled through beforeinput, with a fallback for non-cancelable line-break input. IME composition stays browser-owned.

## Verification (2026-09-07)

All interactive writes used a local mock Sheet endpoint on 127.0.0.1:43123, not production tasks.

- Source TypeScript check passed; 64 Node regression tests passed.
- 18 browser DOM/sanitizer/desktop-mobile roundtrip checks passed.
- Real in-app browser keyboard input: consecutive toggle creation, nested Tab, repeated Shift+Tab, structural undo, first-row slash, Shift+Enter in a title, title-to-text conversion preserving bold/link, and undo of that conversion.
- Three consecutive formats inside a toggle: bullet, quote, nested toggle; then Enter exited two levels and continued outside.
- 390x844 mobile layout: simulated beforeinput insertParagraph and insertLineBreak without keydown, slash acceptance, three consecutive nested formats, three-level exit, and non-cancelable Enter fallback.
- Mobile Shift+Enter preserved an inline newline. Outdent changed padding 44px to 22px; undo restored 44px with the same text. Backspace outdented the first child and undo restored it.
- Synthetic Vietnamese composition plus composing Enter retained the text and row count. Physical Android keyboard behavior remains unverified.
- Save/reload across desktop and mobile retained nested content and formatting.
- Desktop 30-input probe (input + microtask + forced layout, not network/paint): 50 rows median 0.4ms/p95 5.1ms; 200 rows 0.5/1.2ms; 500 rows 0.6/1.4ms. No dependency changes and no new whole-document work on ordinary input.

Reference: https://www.notion.com/help/keyboard-shortcuts (Enter, Shift+Enter, Tab/Shift+Tab). Exact toggle-title continuation is this app's documented contract, not a claim of complete Notion parity.
