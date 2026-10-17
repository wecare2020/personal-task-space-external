# Personal Task Space — GitHub-first external fork

Independent code repository for a small-user pilot on Vercel. The Personal v121
frontend and PH Core 0.5.2 editor/Task Setting are retained. The original Personal
Site and its D1/R2/Sheet data are not modified or imported.

## Architecture

- Native Next.js, Node 24, Vercel Functions.
- GitHub OAuth / Auth.js JWT sessions; users grant profile access only.
- Separate **private** repository `wecare2020/personal-task-space-data`.
- Per-user JSON snapshots under `workspaces/<opaque-owner-id>.json`, plus private
  image files. No user data is bundled with this app or committed to this repo.
- The existing task SQL runs in request-local, in-memory SQLite. It is only a
  query/transaction engine: GitHub JSON is the durable source of truth, not a
  local database or a hosted database service.
- A successful response waits for the entire snapshot to win GitHub SHA compare-
  and-swap. Racing requests replay boundedly against fresh snapshots. Task-level
  CAS, mutation receipts, hidden fields and recovery behavior remain intact.
- Browser drafts/cache are namespaced by account. Old Sites identity headers
  are never trusted. Public share/API tokens route to one tenant and are verified
  inside that tenant's snapshot.

## Autosave

Editor/title drafts are written locally immediately. Remote autosave waits for
30 seconds of inactivity, with a 120-second maximum during continuous editing.
Explicit saves, blur and task navigation retain their flush behavior. Unsaved
drafts are never presented as GitHub-confirmed saves. Property changes and file
uploads remain explicit writes. No Vercel process timer is used as durable storage.

This is a small pilot, not an unlimited multi-user database. GitHub content/API
rate limits, snapshot size and commit history remain operational constraints.
Deleting a record does not erase its older Git history. Do not use this pilot for
sensitive regulated data. Account/data deletion requires a separate retention
workflow before a broader public rollout.

## Setup

1. Use Node 24. Run `npm ci`, `npm run test:external`, `npm run build`.
2. Create a GitHub OAuth app with callback
   `https://YOUR_VERCEL_DOMAIN/api/auth/callback/github`. Use a separate app for
   localhost if needed. Only the app owner configures these credentials.
3. In Vercel's private environment settings, set the variables in `.env.example`.
   Generate a strong random `AUTH_SECRET`. Never paste secrets into chat, source,
   commits, screenshots or client-side environment variables.
4. For `GITHUB_DATA_TOKEN`, use a fine-grained token restricted to the data repo,
   with Contents read/write. Do not reuse an unrestricted development PAT.
5. Optional: `APP_ALLOWED_GITHUB_IDS` restricts the pilot to explicit numeric IDs.
6. Connect **this code repo only** to Vercel. Do not connect the data repo to a
   deployment: saving tasks must never trigger app builds.
7. Configure Production and Preview OAuth redirect/envs separately. Do not point
   untrusted preview code at the production data token/repository.

The first workspace contains only blank Overall and Next & Note. No settings,
tasks, projects, images, share grants or API keys from the Personal app are copied.

## Verification status

Repository creation, local validation and deployment are distinct milestones.
Do not claim a working external deployment until Vercel deployment, OAuth
callback, two-user isolation, media access and reload recovery have passed.

Source baseline: `7c3cf8f478df4caa07ec988c129d7050aeadf348` (Personal v121).
