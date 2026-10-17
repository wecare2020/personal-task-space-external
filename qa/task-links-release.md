# Per-task links

- Existing stable task IDs are encoded in `?task=`; titles, Sheet rows and order
  are not used as routing identities. No schema, API, dependency or access changes.
- Native history updates preserve framework state and other query parameters.
  Only owned same-document history entries intercept Vinext's bubbling popstate
  navigation; other routes remain owned by the framework/browser.
- Explicit missing IDs never fall back to another editable task. Cached defaults
  are not made canonical before successful revalidation. Completed links reveal
  their group; an unloaded target remains pending until the initial read finishes.
- Pending creation IDs stay in local history state until the create is confirmed.
  A late response cannot steal a different task's URL or selection.
- Outgoing title and note drafts are staged before selection changes. Mobile
  navigation snapshots retain the live textarea and composition-adjusted marks,
  so unmount cleanup cannot replace it with an older input snapshot.

Validation: 107 node tests (15 navigation cases plus the existing 92), source
TypeScript check, and production build. Existing lint findings are compared
against HEAD; no new rule violations are accepted.

Codex in-app browser, separate paused local QA data: direct completed link,
group reveal, missing link, Back/Forward, edited title preservation, Vietnamese
note text and bold/bullet preservation after leaving and returning. Real Android
keyboard composition was not hardware-tested in this release. No production
task data is modified by QA.
