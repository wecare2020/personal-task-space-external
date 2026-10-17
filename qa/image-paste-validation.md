# Clipboard image paste validation

- Node regression suite: 128 passing, including seven new clipboard/storage tests.
- TypeScript source check: zero errors. Main editor lint: no new findings against the existing 23-message baseline. New modules lint clean.
- Real local app: clipboard PNG pasted into the desktop editor, image GET loaded, original rich text retained, Undo/Redo worked, image persisted after save and reload.
- Mobile editor: PNG paste plus immediate continued Vietnamese text input retained both; two Undo actions removed text then the new image, preserving the previous document. Browser device emulation is not a real Android IME test.
- Browser DOM harness: seven passing cases for paragraph formatting, ordered-list split and caret preservation, last LI, nested legacy lists, toggle body, callout/column container, and stale/deleted row.
- To rerun the DOM harness, generate `qa/image-editor-generated.js` from `node qa/emit-editor-harness.mjs`, then open `/qa/image-dom-check.html`. Do not commit generated output.
- Reviewed async safety: insert against current document, take Undo snapshot immediately before mutation, defer through composition/link/media/emoji dialogs, abort on editor unmount, reject removed anchors.
- Storage tests cover owner isolation, unauthenticated reads/writes, cross-origin upload rejection, raster signature/MIME checks, 8 MB streaming limit, immutable IDs and concurrent retry idempotency.
- Uses private Sites R2 binding IMAGES. No image bytes/base64 enter task notes, D1 task detail or the Sheet. Existing canonical image figures and absolute HTTPS URLs remain compatible; no editor schema migration.
- Local Sheet sync remained paused. No production task content was used for destructive QA.
