# Task Setting catalogue and type form designer

Personal Task Space only. Owner-only native settings use the existing D1
`personal_task_preferences_v1` revision/CAS document; no task backfill, new DB
binding, access change or Sheet synchronization is introduced.

- Group categorizes Task types, not task status or access.
- Task type attribute defines an immutable field identity and data type.
- Task type x Attribute assigns a field to one type/section, with label,
  visibility, required state, width and order overrides.
- Existing flat Task types and form layouts derive compatible catalogues on
  read without writing D1. Unassigned tasks retain the global Task Form.
- Property, Preview and Edit UI use Core Builder chrome and one settings draft.
  Preview values are synthetic; Save/Cancel remains the settings transaction.
- Hide/Restore preserves definitions and stored values. Old clients cannot
  erase a saved catalogue; stale writes conflict. Required fields apply only
  when saving that Task Form, not while editing title, Brief or other metadata.
- Each task form validates all retained field definitions, so other-type and
  hidden field values survive saves. Related tables keep their own existing
  records, links, permissions and CAS boundaries.

Checks: TypeScript, settings/model/native storage/related record/tab tests,
local synthetic browser preview, add/link/reorder, Undo/Redo, Save/Cancel,
type-specific runtime form, required fields and mobile overflow. No production
task or settings record is changed during QA.
