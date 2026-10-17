# Personal Task Space → PH Core

Personal pins `@wecare2020/ph-core` 0.4.0 using the checked-in
`vendor/wecare2020-ph-core-0.4.0.tgz` and npm lockfile. Upstream:
https://github.com/wecare2020/ph-core/releases/tag/v0.4.0

- The lazy editor imports `usePhBlockNote`, `PhBlockNoteView` and rich-text styles
  from the optional Core entry. Core owns native schema/configuration, slash menu,
  links, Turn into, video UI, quiet handles and completed-checkbox presentation.
- Personal owns document serialization/validation, legacy HTML import, draft and
  snapshot lifecycle, uploads, CAS/idempotency, recovery, API/DB and authorization.
- BlockNote is the only runtime editor. Stored `customer1` preferences read as
  BlockNote without resetting other settings or their revision. No bulk rewrite
  of notes, DB, permissions, Alice, Team, Process or UI Library is performed.
- Core upgrades are deliberate: replace the versioned vendor package, update the
  dependency/lockfile, run tests/browser QA/build, then publish Personal separately.

## Verification for adoption

- Core: full `npm run check`, 42 tests, example builds, all package exports, and
  installed framework-neutral consumer checks. GitHub Validate/Release workflows
  succeeded for `a1e1a4d213a824a6fd15caca4d473c3f7fd975d7` / tag `v0.4.0`.
- Personal: TypeScript, 144 targeted tests and production build.
- Synthetic browser: 6 visual/control checks, 6 slash/checkbox checks, 10 autosave
  cases, and 14 legacy conversion checks. Grey controls apply to portal roots;
  link toolbar is 200×48 px with no excess scroll area; mobile stays in viewport.
  Old notes preserve blanks, hierarchy, tables, images, checkboxes and safe links
  in the tested native conversion. No production task was edited for QA.
- Toolbar chrome is hidden only there; menus keep vertical scrolling and narrow
  formatting toolbars retain horizontal touch/keyboard scrolling.

The old Desktop/Mobile Customer 1 renderer and chooser are removed from app source;
Git history remains recoverable. Import/backup/read-only compatibility helpers stay.
