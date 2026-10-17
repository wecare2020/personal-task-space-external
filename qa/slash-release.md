# Slash-menu release checks — 2026-09-07

Scope: additive slash commands for paragraph, H1/H2/H3, bullet/numbered list, quote, toggle, divider, photo and video. No new dependency, no Sheet schema migration, no actual task data changed during QA.

## Safety boundaries

- Command detection examines only the current row and only a collapsed caret after `/query`. URLs, mid-line slashes and IME composition do not open the menu.
- Native text editing, deferred draft serialization, CAS/journal behavior and document undo remain in use.
- Toggle title/body are independent editable rows on mobile, native details/summary on desktop. Opening/collapsing is UI state, not a Sheet write. Nested toggle creation is bounded at 8; native nested list DOM does not offer block-level slash transformations until flattened by normal document load.
- Media is URL-only: absolute HTTPS, no credentials/data/blob/file URLs. Only canonical YouTube/Vimeo embeds and direct MP4/WebM/Ogg video are accepted. Images are lazy; native video preload is disabled. No autoplay or arbitrary iframe HTML.
- YouTube embeds retain an origin-only cross-origin referrer as required by its embedded player identity policy. Image requests use no-referrer. Source: https://developers.google.com/youtube/terms/required-minimum-functionality
- Apps Script rejects detail writes from older clients when existing/new content has special blocks; property-only changes remain compatible. New client sends editorSchema 3. The previous original Apps Script UI deployment was not changed.

## Verified locally

- 59 Node regression tests pass, including prior sync/storage/list/mark tests, media URL guards and old-client rejection.
- 18 actual-browser helper checks pass: real DOMPurify allowlist; canonical roundtrip for empty headings, divider, empty/rich/nested toggle, lists within toggle, image, embedded/native video and legacy rich lists; mobile serialization parity; open/closed normalization equivalence; six unsafe HTML cases; slash guards.
- Desktop: slash menu filtering, pointer selection, ArrowDown through all choices, toggle title/Enter/body editing, explicit collapse/reopen controls.
- Mobile 390px: slash menu, divider insert, photo URL validation, insert/photo plus blank continuation row, one-step undo restoring `/photo`, toggle collapse/reopen and body visibility.
- Synthetic Vietnamese composition containing `/toggle` does not open menu; switching rows during composition leaves `Tiếng Việt` on the source row and the destination untouched.
- Test fixtures used a mock Sheet server only. No user notes were edited for verification.

## Performance sample

Codex in-app browser, Windows, local development build, 30 typing events per sample. Synchronous input handling + microtasks + forced layout only; excludes paint, network and deferred autosave. Not a physical Android measurement and not an end-to-end speedup claim.

| Rows | Desktop median / p95 (ms) | Mobile median / p95 (ms) |
|---|---|---|
| 50 | 0.8 / 6.9 | — |
| 200 | 0.7 / 1.3 | — |
| 500 | 0.8 / 1.7 | 1.1 / 9.6 |

Physical Android keyboard validation remains user-side. Remote video playback also depends on the video owner's embed permission and provider availability; an Open video link is always retained.
