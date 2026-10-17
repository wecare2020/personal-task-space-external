/** Insert block media without replacing a live text row or its selection. */
export function insertMediaAfterRow(root: HTMLElement, row: HTMLElement, nodes: Node[]) {
  if (!row.isConnected || (row !== root && !root.contains(row)))
    throw new Error('The insertion row changed. Dismiss this upload and paste the image again.');
  let anchor: Element = row;
  let tail: HTMLElement | null = null;
  const selection = root.ownerDocument.getSelection();
  const saved = selection?.anchorNode && selection.focusNode && root.contains(selection.anchorNode) && root.contains(selection.focusNode)
    ? {anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset} : null;
  // Browsers sometimes wrap a list item's text in a paragraph.
  let item = row.closest('li');
  // Legacy nested lists cannot contain atomic media in our normalized block model.
  // Place it after the containing list-item subtree, never inside inline LI content.
  while (item?.parentElement?.parentElement?.closest('li') && root.contains(item.parentElement.parentElement.closest('li'))) {
    item = item.parentElement.parentElement.closest('li');
  }
  if (item && root.contains(item)) {
    const list = item.parentElement;
    if (!list || !['UL', 'OL'].includes(list.tagName)) throw new Error('The insertion row changed. Please paste again.');
    const following = Array.from(list.children).slice(Array.from(list.children).indexOf(item) + 1);
    if (following.length) {
      tail = list.cloneNode(false) as HTMLElement;
      if (list.tagName === 'OL') {
        let number = Number(list.getAttribute('start')) || 1;
        for (const sibling of Array.from(list.children)) {
          if (sibling.hasAttribute('value')) number = Number(sibling.getAttribute('value')) || 1;
          if (sibling === following[0]) break;
          number++;
        }
        tail.setAttribute('start', String(number));
      }
      for (const sibling of following) tail.appendChild(sibling);
    }
    anchor = list;
  }
  const parent = row === root ? root : anchor.parentNode;
  if (!parent) throw new Error('The insertion row changed. Please paste again.');
  const reference = row === root ? null : anchor.nextSibling;
  for (const node of nodes) parent.insertBefore(node, reference);
  if (tail) parent.insertBefore(tail, reference);
  if (saved && root.contains(saved.anchor) && root.contains(saved.focus))
    selection?.setBaseAndExtent(saved.anchor, saved.anchorOffset, saved.focus, saved.focusOffset);
}
