# Personal task types

- Optional stable `taskType` ID in the existing native task JSON. No table migration or bulk task update. Untyped tasks remain untyped.
- Basic catalog: Action, Meeting, Research, Follow-up, Reminder.
- Catalog lives with owner-only D1 settings, using the existing settings revision CAS. Legacy settings gain the catalog on read without losing existing options or revision. Old clients cannot save an incomplete settings object over it.
- Add and rename in Settings. Hide/restore instead of deleting IDs, preserving existing references and undo. Reset defaults preserves the catalog. Maximum 30 types, unique names up to 60 characters.
- Property pane uses the existing optimistic durable-intent task save, field-level conflict checks, and task undo. No editor remount or catalog network call on opening the pane. Catalog changes apply on reopening the app.
- Other property examples are still demos and are labelled separately. Top-of-mind special task controls stay hidden as previously requested.
- Existing editors/anonymous editors preserve task type while editing notes; anonymous shares cannot mutate owner-only task metadata. Read-only task API includes `taskType` when assigned.
- Sheet backup retains the native task-type ID in an encoded trailing `sites-task-metadata` HTML comment in backup notes. Canonical D1 notes remain byte-identical. The fixed-column Apps Script bridge is unchanged. Type names/catalog, like other workspace preferences, remain in D1 settings, not Sheet columns.

Verification: 261 regression tests, TypeScript check, production build. Native tests cover type CAS conflicts, independent edits, clearing, unknown IDs, legacy preferences, catalog rename/hide and destructive/stale settings writes, and backup round trips including clearing the metadata marker.
