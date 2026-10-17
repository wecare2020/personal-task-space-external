# Reliability release QA — 2026-09-07

## Scope
Protocol2 conditional writes, durable per-writer journal/recovery, document editor history,
mobile composition ownership and changed-row work/deferred serialization. Sheet remains
authoritative. No production task records were modified during QA.

## Automated checks
- Source-only TypeScript check passed (work/tsconfig-numbering.json excludes stale generated .next types).
- 51/51 node tests passed: 23 existing create/list/numbering cases,14 backend/storage CAS cases,
  and14 Vietnamese mark-affinity cases.
- vinext production build passed. Its existing static route-classification warning remains.
- Backend tests execute the real Api.js/Code.js/SheetService.js with mocked Google boundaries.

## Codex in-app browser, local mocked Sheet
- Complete true then false with first write forced to fail: no rollback of latest false intent;
  Retry produced ordered true/false writes, final false, empty journal, Saved.
- Desktop type, blur, refocus, CtrlZ: text restored.
- Mobile Enter and type new row: two undos removed text then restored original row structure.
- Mobile undo from a different active row restored the edited row and caret.
- Simulated composition: Alpha + intermediate Tieengs, click Gamma before compositionend,
  final Tiếng. Result Alpha Tiếng remained bold, Gamma was unchanged and became active.
  Undo on Gamma restored Alpha. This is synthetic lifecycle QA, NOT physical Android testing.
- Two IAB tabs changed the same notes: A saved, B showed conflict and kept its later typing.
  Review displayed both versions; Keep my changes used a new CAS write and saved B continued.
- Five selected numbered rows: Tab indented all five; labels1.1–1.5; CtrlZ restored all levels.
- CtrlB on selection then CtrlZ restored the previous inline HTML.
- Failed note save then CtrlZ and Retry: final note stayed reverted; journal emptied.
- Local recovery opened an archived conflict without writing to the Sheet.

## Long-note measurements
Same generated mixed rich-text/blank/3-level fixtures. 30 input events per sample set;
local Windows Codex IAB development build. Desktop uses native execCommand input,
mobile uses synthetic beforeinput/input through the actual editor handlers. Timings include
synchronous input handling, microtasks and forced layout; exclude network, idle save work and
paint/presentation latency. Background rAF timing was unsuitable and is not reported.

| Rows | Desktop median/p95 ms | Mobile median/p95 ms |
| --- | --- | --- |
| 50 | 0.4 / 6.6 | 2.1 / 10.2 |
| 200 | 0.8 / 3.9 | 1.5 / 8.3 |
| 500 | 1.1 / 7.7 | 1.6 / 6.1 |

These are absolute local path measurements, not a speedup claim or Android device latency.
50-row samples predate the final bounded sanitizer-fragment cache;200/500 include it.
Independent linkedom helper benchmarks retained row counts, marks, links and output hashes;
they exclude DOMPurify and React/layout and do not establish end-user speedup.

## Remaining device verification
On the user's Android Vietnamese keyboard: type accented words, Backspace/retype,
tap another row mid-composition, append after bold/italic, rotate/change viewport,
then reopen note. Browser emulation cannot certify that keyboard's IME behavior.
