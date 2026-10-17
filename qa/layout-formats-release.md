# Header, callout and column formats — release QA

## Scope
- Slash menu: Header 1/2/3, Callout, 2 columns, 3 columns.
- One editor/history and the existing note/Sheet format. No new editor dependency or external embed type.
- Desktop columns use equal-width grid; mobile stacks them with subtle column labels.
- Layout insertion is limited to four nested layout regions through the menu.
- Blank Enter exits callouts/columns; plain-row Tab moves between columns; existing list/toggle indentation remains scoped.
- Layout-aware parser, serializer, numbering and mobile structural navigation.
- Schema 4 write guard checks both current and proposed note content. Older editor tabs cannot flatten new formats.
- Apps Script API deployment updated to version 65; original Apps Script UI deployment unchanged.

## Verification
- Node regression suite: 71 tests passed (including schema3 rejection/schema4 acceptance, history/link marks, ordered lists and toggle subtree movement).
- Source-only TypeScript check and production build passed.
- 14 browser fixture checks passed in Codex in-app Chromium, using actual helpers extracted from task-space.tsx:
  headers, inline marks/links, 2/3 columns, empty columns, alternating toggle/layout ownership,
  mixed text and block content, independent numbering, malformed column recovery, empty callouts, HTML allowlist.
- Each fixture retained the same canonical HTML over five reserializations and a mobile model roundtrip.
- Trusted UI keyboard tests on disposable localhost/mock tasks:
  - Desktop insertion of Header 1/2/3, callout, two/three columns; Tab navigation; blank Enter exit.
  - One-step structural undo/redo of adding Callout.
  - Mobile 390x844: stacked columns, callout width and headings; Vietnamese text insertion,
    Enter/exit, undo/redo, new two-column insertion and Tab navigation.
  - Mobile collapse of a toggle containing columns/callout leaves zero visible layout shells.
  - Removing an inner toggle on mobile preserves its callout, both columns and outer toggle after switching back to desktop.
  - Saved state and reload retain formatting/text; no horizontal document overflow observed.
- Full-document normalization spot timings in local desktop Chromium: 50 rows 22ms, 200 rows 85ms, 500 rows 133ms.
  These are single-run normalization measurements, not typing latency or a before/after benchmark.
- API deployment read-only check: HTTP 200, ok true, protocol 2.
- Production publishing retains owner-only audience; no real task contents were changed during QA.

## Limits
- Android hardware keyboard/IME was not available. Mobile viewport tests and existing composition regression tests are not a physical Android certification.
- No arbitrary drag-resize or drag-drop reordering of columns; this is a small additive format feature.
