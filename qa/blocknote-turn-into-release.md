# BlockNote block-menu format conversion — 2026-10-10

- Adds a native `Turn into` submenu to the six-dot block menu: Text, Heading 1–3, Bullet list, Numbered list, To-do, Toggle and Quote.
- Preserves Delete, Colors and table header actions, plus existing side-menu drag/add behavior.
- Updates only block type/format props through one native editor transaction. Content, links, inline marks, block ID and descendants are not replaced.
- Targets the hovered block, or a text-block selection containing it; refuses table/media/divider or mixed non-text selections. Selecting the current format is a no-op (including checked To-dos).
- No schema, persistence, auth, dependency or eager-loading changes; the menu remains within the lazy BlockNote bundle.

## Verified

- TypeScript check and production Vinext build passed.
- 52 targeted tests passed: 13 document/format-option tests plus 39 sharing/reliability tests.
- Real browser, synthetic local fixture only: menu includes Turn into/Delete/Colors; opening it creates no note writes.
- Bullet → To-do preserves bold, italic links, red text and child content. Saved format survives refresh.
- To-do → Bullet while the cursor is in another paragraph targets the menu's block. Child and unrelated paragraph remain identical; one undo restores the previous document, redo and refresh retain the converted document.
- Browser conversions to Heading 2, Numbered list, Toggle, Quote, Text and To-do all retain the parent ID, inline content and child subtree.
- Initial fixture comparison included BlockNote's normal expansion of omitted default props; follow-up undo/refresh comparisons used fully normalized records and passed exactly.

Physical mobile keyboard/accessibility-device testing is not claimed. No production task content was edited for QA.
