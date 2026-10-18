# Personal Task Space

A lean personal workspace for tasks, projects and notes. Duplicate the app and
deploy your own instance on Vercel, with GitHub sign-in and a **separate private
GitHub repository for your data**. No hosted database service is required.

[Create your own copy](https://github.com/wecare2020/personal-task-space-external/generate)
· [Setup guide / Hướng dẫn](docs/self-hosting.md)
· [Personal-use permission](LICENSE)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwecare2020%2Fpersonal-task-space-external&env=AUTH_GITHUB_ID,AUTH_GITHUB_SECRET,AUTH_SECRET,AUTH_URL,GITHUB_DATA_OWNER,GITHUB_DATA_REPO,GITHUB_DATA_BRANCH,GITHUB_DATA_TOKEN&envDescription=Create%20your%20own%20OAuth%20app%20and%20private%20data%20repo.%20Use%20your%20own%20server-only%20secrets.&envLink=https%3A%2F%2Fgithub.com%2Fwecare2020%2Fpersonal-task-space-external%2Fblob%2Fmain%2Fdocs%2Fself-hosting.md&project-name=personal-task-space&repository-name=personal-task-space)

The deploy button starts a copy/deployment, **not a fully configured account**.
Supply your own OAuth app, private data repo and server-only secrets. The original
deployment is not your personal copy or storage backend.

## Included

- Personal v121 task/project UI, views, task types, forms and settings.
- PH Core 0.5.2 BlockNote editor and Task Setting components.
- GitHub sign-in, account-scoped notes, private images and explicit sharing.
- Local drafts, save receipts, conflict protection and reload recovery.
- Remote editor autosave after 30 seconds idle, with a 120-second maximum wait
  during continuous editing. Explicit save, blur and task navigation can flush.

New instances start with blank Overall / Next & Note. No original personal tasks,
projects, images, credentials, API keys or share grants are included.

## Make it yours

1. Select **Use this template → Create a new repository**, or fork this repo.
   Changes in your copy do not change this upstream repository.
2. Create a second **private** data repository, initialized with a README and a
   `main` branch. Never use the public code repo as the data repo.
3. Follow the [self-hosting guide](docs/self-hosting.md) to configure GitHub OAuth,
   a data-repo-only fine-grained token and Vercel environment variables.
4. For personal-only use, set `APP_ALLOWED_GITHUB_IDS` to your numeric GitHub ID.
5. Verify sign-in, a synthetic task, save and reload before adding real notes.

The original repository stays owner-controlled. Duplicating it does not grant
write access here. Your copy and deployment use only your credentials and data.

## Local development

Use **Node 24**. Copy `.env.example` to `.env.local` and set your own values.
Use a separate OAuth app with callback
`http://localhost:3000/api/auth/callback/github` for local development.

```sh
npm ci
npm run test:external
npx tsc --noEmit --incremental false
npm run build
npm run dev
```

## Architecture and limits

Next.js runs on Vercel Node 24. Auth.js JWT sessions identify users by immutable
GitHub ID. Server-side code persists per-owner JSON snapshots and private images
in the separate data repo. Request-local in-memory SQLite executes existing SQL;
it is not a durable database. Saves are acknowledged only after GitHub confirms a
whole-snapshot compare-and-swap. Browser caches and drafts are account-scoped.

This is a **small-user pilot**, not an unlimited multi-user database. GitHub API
limits, snapshot size, token expiry and commit history are operational constraints.
Deleting a task does not erase prior Git history. Data-repository owners can read
stored workspaces. Do not use this pilot for sensitive regulated data. Account/data
deletion needs a separate retention workflow before broad public hosting.

Keep secrets in Vercel server environment settings, never in source or
`NEXT_PUBLIC_*`. Do not expose production secrets to untrusted pull-request or
preview deployments. See [SECURITY.md](SECURITY.md).

## Permission and provenance

Copying, modifying your own copy and self-hosting for personal use are permitted
under [LICENSE](LICENSE). This is a personal-use source-available template, not a
claim that every dependency is open source. Third-party licenses still apply.
The bundled PH Core archives have a narrow personal-use permission for this app;
the separate upstream PH Core repository is not made public or relicensed.

Source baseline: Personal v121, commit
`7c3cf8f478df4caa07ec988c129d7050aeadf348`. The original ChatGPT Site and its
D1/R2/Sheet resources are not modified or imported.
