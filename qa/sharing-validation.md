# Task sharing validation

- Each task defaults to Private; publishing the application does not create grants.
- Share in the top-right offers Can view / Can edit / Private, copy and link replacement.
- Guest surface is separate from TaskSpace; no owner cache, task list, project list, Sheet URL or sync controls.
- All pre-existing workspace data/image/recovery APIs now require the pinned Site owner.
- Guest saves accept title/detail only, use version CAS and scoped request receipts, snapshot recovery, then queue Sheet sync.
- Every write transaction rechecks the live grant. Changing permission, rotating, revoking or deleting during the request prevents the write.
- HTML is parsed and allowlisted in the Workers runtime. Raw-text/foreign namespaces, active attributes and unsafe embeds are removed.
- Internal images are task-scoped, private URLs replace capability URLs before storage, and removed published images stop loading. Pending uploads have a ten-minute edit-grant preview.
- Guest drafts stay in sessionStorage (separate namespace), including a pending request and the desired value after Undo. Unload/background snapshots preserve editor state. Storage failure is visible.
- Guests can review conflicts without retired-editor cleanup overwriting their choice.

Automated checks: qa/sharing.test.mjs exercises the actual Workers HTML parser, D1 and R2 with synthetic data. Existing editor/sync tests remain part of the full suite.
Browser/physical Android keyboard behavior is not implied by server tests.
