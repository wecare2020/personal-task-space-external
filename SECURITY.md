# Security and private data

- This repository contains code, not runtime user data. Keep the separate data
  repository **private**. The app refuses to use a public runtime data repository.
- Never commit `.env.local`, OAuth secrets, data tokens, exported workspaces,
  uploaded files or screenshots of private tasks. `.env.example` has placeholders.
- Use a fine-grained token restricted to **one private data repository**, with
  Contents read/write and required read-only metadata access. Do not grant code
  repo access. Set an expiry and rotate before expiry.
- OAuth requests `read:user user:email`, not repository write access. The app
  owner's server token is a separate credential used only by the server.
- Put secrets in server-only Vercel environment variables, never `NEXT_PUBLIC_*`,
  URLs, issues or chat. Do not give untrusted pull-request code production secrets.
- For personal-only use, restrict `APP_ALLOWED_GITHUB_IDS` to your numeric ID.
  Leaving it empty permits any GitHub account to sign in and use your quota.
- Data-repository owners can read stored workspaces. For an independent personal
  workspace, create your own deployment and private data repository.
- Do not grant upstream collaborator/write/admin access to people duplicating
  the template. Public visitors can copy code, not push to this original repo.
- If a credential is exposed, revoke/rotate it first. Deleting a file or making
  a public repo private again does not remove copies or erase Git history.

For a suspected vulnerability, contact the owner privately using available
profile contact details. Do not post exploits, credentials or user data in public
issues. No dedicated security inbox is configured here.
