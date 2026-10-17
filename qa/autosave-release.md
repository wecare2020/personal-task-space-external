# Fresh editor autosave

- Fresh Brief/title edits use bounded client-side CAS retries instead of immediately asking the user to review. Only explicitly edited fields are sent; native D1 CAS, receipt validation, authorization and server protocols are unchanged.
- Before retrying against a different saved value, both the local intent and the current saved record must be archived in device-local Recovery. Every changed retry payload gets a fresh, durably journaled idempotency key. Network/auth failures are not treated as conflicts.
- A new edit can supersede blocked older mutations of the same fields. Unrelated pending properties remain protected. A late failure from an older request cannot mark a newer live draft as conflicting.
- Incoming refreshes do not lock live editor drafts. Successful saves reconcile unrelated server fields while retaining later queued optimistic edits. Editor focus/cursor is not reset.
- Dormant restored drafts/operations do not automatically overwrite different server content. Editing them again supplies fresh intent. Deleted tasks, repeated contention after three retries, unavailable recovery storage, and unrelated property conflicts retain the review/recovery path.
- Recovery copies remain local to this browser. This is latest-edit behavior with recovery, not collaborative character-level document merging.

## Verification

- `qa/task-save-policy.test.mjs`: nine policy tests for new CAS keys, explicit-field updates, archive ordering, dormant drafts, deletion, wrong-record responses, timeout, quota/persistence failure, bounded retry and ordinary saves.
- `qa/native-backup.test.mjs`: actual native-store SQLite/D1 adapter proves a fresh conflicting title saves with two receipts, unrelated team value retained, archived prior content, and zero Sheet calls. Existing server concurrency/receipt tests remain intact.
- Browser: real TaskSpace and BlockNote, synthetic API boundary only. Fresh notes/title conflict, archived versions, editor focus, slow saves with newer typing, live focus refresh, reload, old recovered draft, delayed older replay, bounded contention then new typing, mobile title save, and blocked overwrite on recovery quota failure. Production task data is never edited for QA.
