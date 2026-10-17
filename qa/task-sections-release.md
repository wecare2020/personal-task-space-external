# Personal task sections

- Three underline tabs after properties: Brief, Task Form, Discussion. Brief stays mounted when hidden; editor key and save path are unchanged.
- Task Form: Purpose & outcome (Goal, Done when), Planning (Priority, Responsible person, Estimated effort, Next step), Reference (Related link). Native details elements provide keyboard-accessible expand/collapse.
- Form and private Discussion notes use explicit Save/Cancel. No request per keystroke or tab switch. Panels are created on first visit, then retained for the selected task.
- Optional taskForm/discussion strings in existing native task JSON; no schema migration, backfill, or task rewrite. Independent CAS field groups, durable mutation journal and task-action undo. Existing clients preserve added fields on unrelated updates.
- Per-tab session drafts survive refresh. Saves keep their original baseline and cannot clear a newer stored draft. Conflict review shows the new fields as well as Brief.
- Existing anonymous share projection stays title/Brief only; no automatic exposure of the new sections. Owner read API includes sections only with full detail. Sheet backup preserves sections in the existing encoded native metadata comment, without changing canonical Brief or Sheet schema.
- Verified local D1 fixture: Save/refresh for both sections, switching section tabs keeps drafts, Cancel, collapse/expand, arrow-key tab navigation, Brief content unchanged. Desktop and 390px mobile screenshots; no horizontal overflow. Production data untouched by QA.
