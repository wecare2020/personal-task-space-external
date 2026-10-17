# Existing Google Sheet backup bridge

Personal now reads/writes only Sites D1. This retained Apps Script deployment is
used solely for one-way backups (`nativeApply`, `createProject`) and its existing
minute runner. Sites ignores Sheet edit events and rejects imports/bootstrap.
No Apps Script or legacy web-app deployment change is required for this cutover.
See `qa/native-backup-release.md` for the current architecture and recovery rules.
The notes below document the retained pre-native bridge protocol for compatibility,
not the foreground task API or a two-way sync workflow.

`Api.js` is the Apps Script API source used by this Site. Deploy it into the existing spreadsheet-bound project alongside its existing `Code.js`, `SheetService.js`, and configuration. Keep the existing API deployment URL and access settings.

`Code.js` must hold its existing `LockService.getScriptLock()` around `apiCreateTask`. The create endpoint checks the stable app ID in column H while holding that lock, returning the original row on retries without overwriting subsequent edits.

Publish this backend update before the Site frontend, whose pending-create recovery reuses the same task ID after a timeout or reload.

Regression check: `node --test qa/create-task-idempotency.test.mjs`.

Protocol 2 updates require a stable request ID and expected values for every
changed field (including coupled status/isTop and project fields). Code.js holds
the ScriptLock across compare, write, flush, and replay receipt. Conflicts return
top-level ok:false, code:CONFLICT, currentTask and fields; the Site proxy returns
HTTP409 before unwrapping the result. Old clients fail closed and must reload.

Ship Api.js and Code.js together to the existing Sites API deployment, then the
Site frontend. Do not update the original legacy web-app deployment. Configuration
and tokens remain private in the existing Apps Script project, not in this repo.

The browser keeps an ordered mutation journal and per-document recovery namespace.
Failed/uncertain operations are replayed with the same request ID; no blind rebase.
Review uses another conditional write, and archives both versions before resolving.
Recovery is read-only and can export previous-tab drafts without deleting them.

Regression checks: `node --test qa/*.test.mjs`.
