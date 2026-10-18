# Deploy your personal copy

You need GitHub, Vercel and Node 24 for local development. No separate hosted
database service is used. You maintain your copy, credentials and data.

## 1. Duplicate the code

Use [this template](https://github.com/wecare2020/personal-task-space-external/generate)
or fork the repository to your own account. A copy is independent: editing it
does not change the original repository. Installation uses the bundled PH Core
archive and does not need access to the private upstream package registry.

## 2. Create a private data repository

Create a **new private repository**, e.g. `my-personal-task-data`. Initialize it
with a README so its `main` branch exists. Keep it separate from the code repo
and do not connect it to Vercel: data saves must never trigger app builds.
The server creates workspace files; no schema import or personal data is needed.

Create a fine-grained GitHub token restricted to this data repo only. Grant
Contents **read and write**, plus required read-only metadata access. Choose an
expiry and save it only in private server environment settings. Do not grant
code-repo permission or use an unrestricted classic token.

## 3. Choose your production domain and configure OAuth

Import your **code repo** into Vercel as a Next.js project, using Node **24.x**.
Choose your project name and confirm its production domain. An initial deploy
without credentials may show "GitHub sign-in is not configured yet"; finish setup
and redeploy to enable sign-in.

In GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**, create
your own application with:

- Homepage URL: `https://YOUR_PRODUCTION_DOMAIN`
- Callback: `https://YOUR_PRODUCTION_DOMAIN/api/auth/callback/github`

Store the client ID and secret privately. Users grant profile and email access
(`read:user user:email`), not repo write access. Do not reuse the original app's
OAuth app, data repository or credentials.

## 4. Configure Vercel environment variables

Set these in **Production** server environment settings. Replace all examples.
Never commit values or use `NEXT_PUBLIC_*` for secrets.

| Variable | Your value |
| --- | --- |
| `AUTH_GITHUB_ID` | Your OAuth app client ID |
| `AUTH_GITHUB_SECRET` | Your OAuth app client secret |
| `AUTH_SECRET` | A new cryptographically random signing secret, at least 32 characters |
| `AUTH_URL` | Your exact production origin, e.g. `https://my-tasks.vercel.app` |
| `GITHUB_DATA_OWNER` | Your GitHub account/organization login |
| `GITHUB_DATA_REPO` | Your private data repo name, without the owner prefix |
| `GITHUB_DATA_BRANCH` | `main`, or the existing data branch |
| `GITHUB_DATA_TOKEN` | Your data-repo-only fine-grained token |
| `APP_ALLOWED_GITHUB_IDS` | Your numeric GitHub ID; recommended for personal-only use |

Generate a new `AUTH_SECRET` locally, for example:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Do not share the output or run this in a public/shared log. Your public numeric
GitHub ID is the `id` field at `https://api.github.com/users/YOUR_USERNAME`, not
your username. Multiple permitted IDs may be comma-separated. An empty allowlist
permits any GitHub account to create a workspace, consuming your storage/API quota.

Redeploy after setting environment variables. Keep callback and `AUTH_URL` aligned
if the domain changes. Use separate OAuth apps and private data repos for local
or preview testing; never expose production secrets to untrusted previews.
Local development uses `http://localhost:3000/api/auth/callback/github`.

## 5. Verify before real use

1. Open production, continue to GitHub and complete sign-in.
2. Confirm blank Overall / Next & Note, not someone else's tasks.
3. Create a synthetic task/note, save, reload and verify exact content.
4. Check a checkbox and upload a private image, then reload again.
5. Confirm data commits go to your **private data repo**, not the code repo, and
   data saves do not launch Vercel builds.
6. If inviting others, use a second account to verify isolation, private images,
   shares and reload recovery first. The repo owner can read stored workspaces.

The deploy button copies/deploys code only. It does not create the OAuth app,
private repo or token, and does not prove these checks passed.

## Maintenance and limits

This is a small-user pilot: GitHub API limits, snapshot sizes, whole-snapshot
updates, image sizes, expiring tokens and commit history limit scalability.
Deletion does not erase older Git commits. Keep private backups; do not use this
pilot for regulated sensitive data or promise complete deletion/retention.

A missing/expired token, nonexistent branch, public data repo or wrong permissions
causes storage to fail closed. Review/test upstream updates before adopting them;
updates to the original repository do not automatically change your copy.

## Hướng dẫn nhanh tiếng Việt

1. Chọn **Use this template** để tạo repo code riêng của bạn.
2. Tạo repo data **private** riêng, có README và branch `main`.
3. Tạo token chỉ cho repo data, quyền Contents read/write.
4. Import repo code vào Vercel, chọn Node 24 và lấy production domain.
5. Tạo GitHub OAuth App riêng, callback:
   `https://DOMAIN_CỦA_BẠN/api/auth/callback/github`.
6. Điền các biến môi trường ở bảng trên rồi redeploy. Nên đặt
   `APP_ALLOWED_GITHUB_IDS` là numeric ID của bạn để chỉ bạn đăng nhập được.
7. Tạo task thử, lưu, reload kiểm tra trước khi dùng thật.

Không dùng secrets hay repo data của tác giả. Bản sao độc lập không có quyền sửa
repo gốc. Xem [quyền dùng cá nhân](../LICENSE) và [bảo mật](../SECURITY.md).

## Platform references

- [GitHub templates](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository)
- [Vercel Deploy Button](https://vercel.com/docs/deploy-button)
- [Deploy Button environment keys](https://vercel.com/docs/deploy-button/environment-variables)
