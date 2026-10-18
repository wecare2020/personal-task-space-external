# Personal Task Space — external GitHub-first fork

Independent fork of Personal v121, commit 7c3cf8f478df4caa07ec988c129d7050aeadf348.
Never deploy or write to the original Personal, Alice, Team, Process, UI Design
System, Sites D1 or R2 resources. No production records or images are copied.

- Preserve the Personal frontend, Core 0.5.2, editor, settings, drafts,
  Save/Cancel, stable IDs and hidden values.
- Target native Next.js on Vercel Node 24, not ChatGPT Sites or Workers.
- Code is a public template, read-only to visitors. Runtime data stays in a
  separate PRIVATE GitHub repository. Never grant visitors upstream write access.
- GitHub OAuth identifies users. Never trust Sites identity headers.
- Durable storage is a per-owner JSON snapshot in the private data repo.
  In-memory SQLite may execute existing SQL; never write a durable local DB.
- Scope reads, writes, shares, service keys, images and browser caches to owner.
  Server credentials never reach browsers or logs.
- Acknowledge writes only after the entire snapshot wins GitHub SHA CAS.
  Preserve task receipts/CAS. Retry boundedly using fresh snapshots, never force.
- Coalesce editor autosave client-side with durable drafts and a maximum wait.
  Explicit Save, navigation and blur may flush. Server timers are not durable.
- Do not copy the original Sheet link or credentials. Old Sheet runner endpoints
  fail closed and never contact Personal. GitHub is authoritative.
- Test account isolation, concurrent commits, failed writes, idempotency,
  private assets, signed tokens, draft recovery and unchanged UI.
- Initialize only blank Overall / Next & Note and safe defaults.

Task Setting remains imported from Core. Preview is synthetic and never writes
task records. Hide/Restore retains values; field kinds and IDs are immutable.
