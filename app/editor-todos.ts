// Persist only the paragraph attribute. Controls are ephemeral editor chrome.
export const TODO_ATTRIBUTE = 'data-editor-todo';
export function todoState(node: Element): boolean | undefined {
  if (node.tagName !== 'P' || !node.hasAttribute(TODO_ATTRIBUTE)) return undefined;
  return node.getAttribute(TODO_ATTRIBUTE) === 'true';
}
export function setTodoState(node: HTMLElement, checked?: boolean) {
  if (checked === undefined) node.removeAttribute(TODO_ATTRIBUTE);
  else {
    node.setAttribute(TODO_ATTRIBUTE, String(checked));
    node.setAttribute('data-editor-compact', 'true');
  }
}
export function refreshTodoControls(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-todo-control]').forEach(control => {
    if (!control.parentElement || todoState(control.parentElement) === undefined) control.remove();
  });
  const rows = Array.from(root.querySelectorAll<HTMLElement>('p[data-editor-todo]'));
  if (root.matches('p[data-editor-todo]')) rows.unshift(root);
  rows.forEach(row => {
    let control = row.querySelector<HTMLButtonElement>(':scope > button[data-todo-control]');
    if (!control) {
      control = row.ownerDocument.createElement('button');
      control.type = 'button';
      control.className = 'editor-todo-checkbox';
      control.setAttribute('data-todo-control', '');
      control.contentEditable = 'false';
      control.setAttribute('role', 'checkbox');
      row.insertBefore(control, row.firstChild);
    }
    row.querySelectorAll('[data-todo-control]').forEach(other => { if (other !== control) other.remove(); });
    if (row.firstChild !== control) row.insertBefore(control, row.firstChild);
    const checked = String(todoState(row));
    if (control.getAttribute('aria-checked') !== checked) control.setAttribute('aria-checked', checked);
    const label = row.textContent?.trim() || 'To-do';
    if (control.getAttribute('aria-label') !== label) control.setAttribute('aria-label', label);
  });
}
export function todoControlMutation(record: MutationRecord) {
  if (record.target instanceof Element && record.target.closest('[data-todo-control]')) return true;
  return record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].length > 0 &&
    [...record.addedNodes, ...record.removedNodes].every(node => node instanceof Element && node.hasAttribute('data-todo-control'));
}
