# D1-only Personal storage

D1 is the only task/project database. R2 retains images. Google Sheet is a one-way
backup destination; no imports, three-way merges or Sheet fallback remain. Alice
and Team resources and permissions are unchanged.

## Load and save

Reads/writes perform no Sheet work, even after response. The latest confirmed
browser cache renders immediately; D1 revalidates it. Owner-authorized ETags give
unchanged repeat reads bodyless 304 responses using the exact earlier snapshot.
Native writes invalidate that in-memory read cache. No CDN/shared caching.
Backup status loads only when its popover opens; backup never refreshes tasks.
CAS, receipts, undo, drafts, journals, sharing and rich editor guards stay intact.

## Background backup

The existing Apps Script minute timer calls secret-protected `/api/sync/run`.
The runner drains at most four dirty tasks and one project per bounded run using
the existing conditional `nativeApply` bridge. Old Sheet on-edit calls are ignored.
Bootstrap and Sheet-resolution requests return 410. No new trigger scopes needed.
Backup now runs post-response. Pause affects only backup, never native saves.
Uncertain exports retain their immutable attempt and ten-minute execution fence.
Acknowledgments never clear newer versions. Errors persist and retry durably.

The first run atomically archives old conflicts and queues current D1 records
without changing task contents/versions. It sets `backupMode=one-way`; the initial
backup can need several timer runs. Existing recovery remains downloadable.
Manual edits to a queued Sheet row are archived before the D1 backup replaces
them. Sheet-only extra rows are not imported or removed. Deletion uses existing
recoverable column-J tombstones and preserves unrelated/formula cells.

## Verification and operations

SQLite tests cover CAS/idempotency, independent writes, retries, delayed ack,
lease fencing, cutover/archive rollback, tombstones, exact HTML and D1 revisions.
Foreground and UI regression tests prove no Sheet fallback, no load-time backup
polling and no backup-triggered editor reload. Measurements must distinguish local
from hosted results. Keep D1 authoritative during any rollback; never clear the
outbox, drafts or recovery just to solve backup delays. Existing migrations remain
immutable; this release needs no schema changes or new dependencies.
