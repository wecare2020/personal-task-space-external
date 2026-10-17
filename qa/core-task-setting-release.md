# Shared Task Setting adoption

Personal imports the versioned PH Core tasks contracts, validation, fields and
Type Designer. App files are compatibility facades, not copied implementations.
Settings categories derive from Core TASK_SETTING_DEFINITIONS.

Personal retains owner-only D1 settings, revision/CAS, drafts, Save/Cancel,
task persistence, related-record export and auth. The Core module has no endpoint
or storage access. UI Design System consumes the same package with local demo
storage and cannot contact this workspace.

Migration does not write existing settings or task data. Legacy preferences,
task type/attribute IDs, rich text, hidden/custom values and backup behavior remain.
Core updates require a reviewed package bump and deployment of each app.
