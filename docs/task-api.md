# Read-only Task API

Base URL: https://personal-task-space-sheet.khoitran.chatgpt.site/api/v1/tasks

Manage credentials as the workspace owner at https://personal-task-space-sheet.khoitran.chatgpt.site/api-access. Create a separate key per integration, copy it once, and revoke it there when no longer needed. Keys expire after the selected 30, 90, or 365 days. Tokens are stored only as SHA-256 hashes and can read all tasks in this Personal workspace. They do not authorize the app's write endpoints, public sharing, image uploads, or sync administration.

Send `Authorization: Bearer YOUR_API_KEY`. No query-string token or cookies are accepted as API authentication. Keep keys in the calling app's server-side secret storage.

## Requests

`GET /api/v1/tasks` returns active task summaries by default. Parameters:

| Parameter | Values |
| --- | --- |
| limit | Integer 1–100; default 50 |
| completed | active (default), completed, all |
| status | today, upcoming, later |
| project | Exact project ID, URL-encoded |
| q | Title substring, up to 200 characters |
| includeDetail | true / false (default false); when true, limit defaults to 10 and must be 1–10 |
| cursor | nextCursor from the prior page; preserve filters |

Response: `{ "ok": true, "result": { "storage": "d1", "items": [], "nextCursor": null } }`.

Task summaries contain id, title, date, completed, status, isTop, team, projectId, projectIds, version, updatedAt. Details are omitted unless requested. Pagination follows ascending immutable task ID; it is a live view, not a frozen snapshot. New/updated tasks can appear between requests. Filter changes require starting over without a cursor.

`GET /api/v1/tasks/{id}` returns `{ "ok": true, "result": { "storage": "d1", "task": { ... } } }`, including `detail` as rich HTML. Render HTML only with an appropriate sanitizer. Existing private image URLs remain owner-protected; the read key grants task text access only.

```sh
curl 'https://personal-task-space-sheet.khoitran.chatgpt.site/api/v1/tasks?completed=all&limit=50' \
  -H "Authorization: Bearer $TASK_READ_API_KEY"
```

All reads use committed D1 data and do not wait for Google Sheets. Unsaved browser drafts are not exposed. Native-not-ready returns 503 rather than falling back to Sheets. Successes and errors are no-store. No CORS grant is supplied for cross-origin browser apps.

## Errors

401 missing/invalid/expired/revoked key; 400 invalid filter/cursor; 404 missing/deleted task; 405 write method; 503 D1 unavailable/not ready. Error shape: `{ "ok": false, "code": "...", "error": "..." }`.

Only GET is supported on the task endpoints. POST/PUT/PATCH/DELETE always return 405 and do not mutate tasks.
