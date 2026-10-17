// Same-document task navigation. No router, network, storage, or data writes.
const HISTORY_KEY = 'personalTaskSpace';
export type TaskLocation = { taskId: string | null; detail: boolean; pending: boolean };
type NavigationReason = 'initial' | 'history' | 'open' | 'canonical' | 'list';
type Browser = Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>;

export function taskHref(href: string, taskId: string | null) {
  const url = new URL(href);
  if (taskId === null) url.searchParams.delete('task');
  else url.searchParams.set('task', taskId);
  return url.pathname + url.search + url.hash;
}

export function readTaskLocation(href: string, state: unknown): TaskLocation {
  const url = new URL(href);
  const saved = state && typeof state === 'object' ? (state as Record<string, unknown>)[HISTORY_KEY] as Partial<TaskLocation> | undefined : undefined;
  const taskId = url.searchParams.get('task');
  // Unconfirmed creations are local history state, never a shareable task URL.
  const pending = taskId === null && saved?.pending === true && typeof saved.taskId === 'string';
  return { taskId: pending ? saved!.taskId! : taskId, pending, detail: saved?.detail ?? taskId !== null };
}

export function resolveLinkedTask<T extends {id: string}>(tasks: T[], requestedId: string | null, fallbackId: string) {
  return tasks.find(task => task.id === (requestedId ?? fallbackId));
}

export function canCanonicalizeTask(location: TaskLocation, fresh: boolean, hasPendingCreation: boolean) {
  return (location.pending || fresh) && !(location.taskId === null && hasPendingCreation);
}

export function createTaskNavigation(browser: Browser, onNavigate: (next: TaskLocation, reason: NavigationReason) => void, beforeNavigate: (nextId: string | null) => void) {
  const shell = taskHref(browser.location.href, null);
  let current = readTaskLocation(browser.location.href, browser.history.state);
  let started = false;
  function write(next: TaskLocation, mode: 'pushState' | 'replaceState') {
    const href = taskHref(browser.location.href, next.pending ? null : next.taskId);
    // Preserve framework history metadata; task navigation owns only its key.
    browser.history[mode]({ ...browser.history.state, [HISTORY_KEY]: { ...next, shell } }, '', href);
    current = next;
  }
  function traverse(event: PopStateEvent) {
    const saved = event.state?.[HISTORY_KEY];
    if (saved?.shell !== shell || taskHref(browser.location.href, null) !== shell) return;
    // Vinext otherwise starts an RSC navigation on every popstate. Handle only
    // our own same-document entries, before its bubbling router listener.
    event.stopImmediatePropagation();
    const next = readTaskLocation(browser.location.href, event.state);
    beforeNavigate(next.taskId);
    current = next;
    onNavigate(current, 'history');
  }
  return {
    start() {
      if (started) return;
      started = true;
      write(current, 'replaceState');
      browser.addEventListener('popstate', traverse, true);
      onNavigate(current, 'initial');
    },
    stop() { browser.removeEventListener('popstate', traverse, true); started = false; },
    current: () => current,
    open(taskId: string, confirmed = true, replace = false) {
      if (current.taskId === taskId && current.detail && current.pending === !confirmed) return;
      beforeNavigate(taskId);
      const next = { taskId, detail: true, pending: !confirmed };
      write(next, replace ? 'replaceState' : 'pushState');
      onNavigate(next, 'open');
    },
    canonicalize(taskId: string) {
      // Never replace an explicit missing link or steal focus after a create
      // response arrives while the user is already looking at another task.
      if (current.taskId !== null && (!current.pending || current.taskId !== taskId)) return;
      const next = { ...current, taskId, pending: false };
      write(next, 'replaceState');
      onNavigate(next, 'canonical');
    },
    list() {
      beforeNavigate(current.taskId);
      const next = { ...current, detail: false };
      write(next, 'replaceState');
      onNavigate(next, 'list');
    },
  };
}
