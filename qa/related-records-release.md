# Personal Task Form and independent related records

- Existing Brief/editor identity, task fields and task Sheet backup stay unchanged.
- Task Form layout is a versioned workspace preference. Old preferences acquire the default layout without resetting existing values or revision.
- Add task sections/custom fields and native related-table definitions in Settings. Hide/restore removes UI only. Stable field IDs/types and existing definitions cannot be deleted by settings writes.
- Related records and task links use separate, indexed D1 native_state key namespaces, not taskForm copies. No schema migration/backfill or initial task-read query was added.
- Owner-only /api/related supports bounded lazy reads, exact-table search, independent CAS writes, stable-ID create/link retries, and unlink without deleting records. Public share routes/read-only task keys do not expose independent tables.
- Explicit related-record Save/Cancel, table/name context, per-tab/task/record drafts, comparison with saved version, and conflict rejection protect the editing target. Ctrl+Z from this independent panel cannot accidentally undo a current-task action.
- Sheet does not back up independent related records. Settings offers a paginated JSON export including their definitions and links; export failures never download an incomplete file.

## Verification

- Browser QA used only local D1 task-native-qa-0001, never production records.
- Created and saved a related Deliverables record; reloaded and found it persisted, including its checkbox value. Original current-task Goal remained unchanged.
- Related editor draft survived Discussion/Task Form switching. Cancel restored saved description.
- Added Review QA section + Approval note field in local Settings; saved config, entered a value in Task Form, saved task and reloaded. Custom value persisted.
- 390px viewport: table scroll contained in panel after fixing absolute screenreader-label containment; document width 375 <= innerWidth 390. Viewport reset and QA tabs closed.
- Backend tests cover shared records across tasks, CAS races and stale saves, idempotent retries, unlink/relink version guard, owner/privacy/origin boundaries, invalid field values, hidden-definition preservation and export pagination.
- No production related records, tasks or settings were edited during QA. Production usage, browser-restart draft recovery and large-catalog load timings are not claimed as verified.
