# Personal editor choices — 2026-10-10

Scope: Personal only. No Alice/Team/UI Library/production task content or audience changes.

## Follow-selected-editor update (supersedes the compatibility policy below)

- The global editor choice now always applies. Removed per-note forced Customer 1/BlockNote routing and passive compatibility notices.
- Opening legacy HTML in BlockNote converts it once and stages a normal recoverable, revision-checked draft; native JSON reloads do not re-convert or auto-save again. No full-database batch rewrite.
- Reuses the proven simple HTML fast bridge; extended HTML uses BlockNote's native HTML parser. Customer 1-specific toggle, to-do, Quill indent, table and media markers have bounded adapters.
- Legacy callouts become native quotes, columns become native tables, and tree title/name/note/parent-child content becomes nested native blocks (including collapsed rows). These are editable equivalents, not identical custom Customer 1 widgets.
- Native video blocks retain YouTube/Vimeo embeds with an allowlisted renderer; direct file videos use the library renderer. Shared metadata strips internal bearer URLs for video as well as image blocks.
- Switching to Customer 1 renders every note there; switching without edits preserves native metadata. Customer 1's own formatting capabilities apply when editing there. Draft/upload/error guards remain intact.
- Import transactions are excluded from undo history, so the first Ctrl+Z cannot erase a newly imported document.
- Verified: TypeScript; 55 model/format/share/reliability checks; 14 browser conversion checks; 10 real UI switching/draft checks using synthetic local data. Toggle children, nested lists, two blank rows, table headers, and Customer 1 edits survive the tested round trip. No production task was modified for QA.
- Synthetic simple-note conversion microcheck in the dev browser: 50/200/500 rows took 1.8/8.5/14.6 ms in one sample. Extended native parsing is more expensive (observed hundreds of ms for 500 rows before the simple fast path); these are conversion-only timings, not total app-load benchmarks.

## Behavior

- Existing desktop/mobile editor remains Customer 1. New default preference is Text editor 2 · BlockNote (0.55.0, Ariakit UI).
- Gear exposes both choices directly; Settings → Task Setting → Text editor retains the same choice. Native D1 preference saves use the existing revision/CAS API, without Sheet calls.
- Switching is blocked while edits, conflicts, uploads or saves are pending. Failed preference saves leave the active editor unchanged.
- No note migration or save on mount/switch. JSON preserves native BlockNote structure, with an escaped compatible HTML fallback for previews/backup/context. Unsupported legacy notes remain editable in Customer 1; native-only BlockNote notes stay in BlockNote even if the global preference is Customer 1.
- Lazy editor bundle; 120 ms draft batching; bounded canonicalization caches; generated BlockNote HTML avoids the legacy full-DOM normalization pipeline.
- Six-dot icon is 15 px, muted, with a 26×28 px desktop hit target and 30×32 px mobile minimum. Existing Customer 1 handles/checkbox geometry unchanged.
- Public sharing preserves validated JSON, rewrites private/shared image URLs, and guards old clients with editor schema 8. Existing permissions and data projection remain unchanged.

## Verification

- TypeScript noEmit and Vinext production build pass.
- 98 targeted model/settings/sharing/navigation/reliability/table/tree/checkbox tests pass.
- Real Chromium, synthetic local fixture only: initial load and refresh make zero writes; Enter at start of bullet does not duplicate content; two explicit blank paragraphs survive switch/refresh; checkbox persists; slash Table creates a real table, editable cell content persists and reloads; Customer 1 ↔ BlockNote switching alone keeps the original note byte-for-byte; failed settings save and pending draft block switching; legacy toggle and blank rows remain in Customer 1.
- 390×844 responsive viewport: Enter-at-start keeps a single copy of bullet text; no horizontal document overflow. This is not a physical Android keyboard/IME certification.
- Synthetic canonicalization-only microcheck, desktop dev browser (one cold sample, not total app load/typing benchmark): 50 rows 4.9 ms, 200 rows 9.2 ms, 500 rows 27.3 ms; payload sizes 13,559 / 54,509 / 136,709 characters. The unchanged document path is cached.
- Build emits a separate ~910 kB minified JS editor chunk and ~57 kB CSS (raw sizes, not gzip). Customer 1 and initial app shell do not import the library eagerly. No claim of zero bundle cost.

## Limits / follow-up

- Initial BlockNote slash schema is focused: paragraph, headings, bullets, numbering, to-do, quote, toggle, divider, image, table. Custom tree/columns/callout and other legacy-specific formats are not silently converted.
- npm production audit also flags existing pinned Next/DOMPurify/transitive tooling versions; the new BlockNote packages are not listed as vulnerable. No blanket dependency upgrades were applied in this focused editor change. Runtime applicability of those pre-existing advisories needs a separate dependency maintenance pass.
- Browser fixtures mock settings persistence and use synthetic data. Native DB/API authorization, concurrency, share projection and persistence are separately exercised in Miniflare tests. No production note was edited for QA.
