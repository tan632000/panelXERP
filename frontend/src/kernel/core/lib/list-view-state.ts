/**
 * The filters a reader set on a list, kept while they work elsewhere in the same browser tab.
 *
 * A reader who narrows a list to one supplier, looks at another screen and comes back has to
 * land on the list they were reading, not on the unfiltered one they started from. The
 * selections ride in session storage, so returning through the menu restores them, and are
 * mirrored into the URL (below), so a copied link shares them.
 *
 * Everything is stored under one entry per list path.
 */

const STORAGE_PREFIX = "erp.list-view.";

/** Every persisted value of one list, keyed by the name its screen gave the filter. */
type ListViewScopeState = Record<string, unknown>;

/** Session storage is unavailable while rendering on the server and in locked-down browsers. */
function getStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function scopeKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

/** Reads back every filter kept for one list. Anything unreadable counts as nothing kept. */
export function readListViewScope(scope: string): ListViewScopeState {
  const store = getStore();
  if (!store) return {};
  try {
    const raw = store.getItem(scopeKey(scope));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as ListViewScopeState;
  } catch {
    return {};
  }
}

/** Reads one filter, falling back when the list kept nothing under that name. */
export function readListViewValue<T>(
  scope: string,
  key: string,
  fallback: T,
): T {
  const stored = readListViewScope(scope)[key];
  return stored === undefined ? fallback : (stored as T);
}

/** Keeps one filter of a list. A value that cannot be serialized is simply not kept. */
export function writeListViewValue(
  scope: string,
  key: string,
  value: unknown,
): void {
  const store = getStore();
  if (!store) return;
  try {
    const next = { ...readListViewScope(scope), [key]: value };
    store.setItem(scopeKey(scope), JSON.stringify(next));
  } catch {
    /* A full or disabled store only costs the reader their filters, never the screen. */
  }
}

/**
 * Forgets every list's filters in this tab. Called whenever a session begins or ends, so the
 * next person to sign in on a shared machine does not inherit the previous reader's filters —
 * possibly on a column their own role cannot even see to clear.
 */
export function clearAllListViewState(): void {
  const store = getStore();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    /* Nothing to recover from: the filters are only a convenience. */
  }
}

/**
 * The filters a reader set also ride in the address bar, so a link copied from a list opens
 * the same view for whoever receives it. Each filter is one query parameter named after its
 * key; a filter at its default value leaves the URL, which keeps a plain list link plain.
 *
 * Text travels as itself and anything else as JSON, decided by the filter's default value —
 * the one thing every reader of a key agrees on.
 *
 * A list URL also carries `lv=1` while any filter is on screen. It marks the URL as the whole
 * view: a key it lacks sits at its default. Without the marker, a receiver who had filtered
 * the same list in that browser tab would get their own kept values mixed into the sender's.
 */
const SNAPSHOT_PARAM = "lv";

/** Paths whose arrival URL has been read and written back; later mounts there are tab switches. */
const settledPathnames = new Set<string>();

/**
 * Whether the URL being read is a complete view a reader arrived with — a shared link, a
 * reload, a Back — rather than one this page is still building, as when a tab is switched to.
 */
export function isListViewUrlSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (settledPathnames.has(window.location.pathname)) return false;
  return new URLSearchParams(window.location.search).has(SNAPSHOT_PARAM);
}

/** A value check beyond the shape the default implies, e.g. a column selection's string lists. */
export type ListViewValueCheck = (value: unknown) => boolean;

/** Reads one filter out of the address bar; `undefined` when absent or unreadable. */
export function readListViewUrlValue<T>(
  key: string,
  fallback: T,
  isValid?: ListViewValueCheck,
): T | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = new URLSearchParams(window.location.search).get(key);
  if (raw === null) return undefined;
  let value: unknown = raw;
  if (typeof fallback !== "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (!matchesShape(value, fallback)) return undefined;
  }
  return !isValid || isValid(value) ? (value as T) : undefined;
}

/**
 * A hand-edited link must not hand a filter a value of another kind — a page that is text, a
 * column selection that is a list. The default fixes the kind; an absent default (a sort)
 * takes a plain object.
 */
function matchesShape(value: unknown, fallback: unknown): boolean {
  if (fallback === undefined || fallback === null) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  if (typeof value !== typeof fallback || value === null) return false;
  if (typeof fallback === "number") return Number.isFinite(value);
  return Array.isArray(value) === Array.isArray(fallback);
}

function encodeListViewUrlValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Pending writes, flushed together so a filter change and its page reset make one URL edit.
 * Each remembers the page it belongs to: a list left for another page releases its keys after
 * the router already shows the new URL, and must not strip that page's parameters.
 */
const pendingUrlWrites = new Map<
  string,
  { value: string | null; pathname: string }
>();
let urlFlushScheduled = false;

/** How many mounted filters read each URL parameter; one tab's table may share a key with another's. */
const mountedUrlKeys = new Map<string, number>();

function flushListViewUrl(): void {
  urlFlushScheduled = false;
  if (typeof window === "undefined" || pendingUrlWrites.size === 0) return;
  const { pathname } = window.location;
  const url = new URL(window.location.href);
  let touched = false;
  for (const [key, write] of pendingUrlWrites) {
    // Written for a page the reader already left: it must not land on this one.
    if (write.pathname !== pathname) continue;
    touched = true;
    if (write.value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, write.value);
  }
  pendingUrlWrites.clear();
  if (!touched) return;
  settledPathnames.add(pathname);
  if (mountedUrlKeys.size > 0) url.searchParams.set(SNAPSHOT_PARAM, "1");
  else url.searchParams.delete(SNAPSHOT_PARAM);
  if (url.href === window.location.href) return;
  // Replace rather than push: refining a filter is not a step the Back button should replay.
  try {
    window.history.replaceState(null, "", url);
  } catch {
    /* Safari throttles history edits (a live search types fast); the next change catches up. */
  }
}

/**
 * Mirrors one filter into the address bar, dropping it there while it equals its default.
 * Writes queue for a microtask so every filter a single change touches lands in one edit.
 */
export function writeListViewUrlValue(
  key: string,
  value: unknown,
  defaultValue: unknown,
  pathname?: string,
): void {
  if (typeof window === "undefined") return;
  const isDefault =
    value === undefined ||
    encodeListViewUrlValue(value) === encodeListViewUrlValue(defaultValue);
  pendingUrlWrites.set(key, {
    value: isDefault ? null : encodeListViewUrlValue(value),
    pathname: pathname ?? window.location.pathname,
  });
  if (urlFlushScheduled) return;
  urlFlushScheduled = true;
  queueMicrotask(flushListViewUrl);
}

/**
 * Marks a filter as on screen. The returned release drops its parameter from the URL once the
 * last filter reading it leaves — a tab switched away from must not leave its search behind in
 * the link. This tab's session storage keeps the value, so coming back restores it.
 */
export function retainListViewUrlKey(key: string): () => void {
  const pathname =
    typeof window === "undefined" ? "" : window.location.pathname;
  mountedUrlKeys.set(key, (mountedUrlKeys.get(key) ?? 0) + 1);
  return () => {
    const remaining = (mountedUrlKeys.get(key) ?? 1) - 1;
    if (remaining > 0) {
      mountedUrlKeys.set(key, remaining);
      return;
    }
    mountedUrlKeys.delete(key);
    writeListViewUrlValue(key, undefined, undefined, pathname);
  };
}

/** Forgets which pages settled their URL; a test starts each case as a fresh arrival. */
export function resetListViewUrlTracking(): void {
  settledPathnames.clear();
  pendingUrlWrites.clear();
  mountedUrlKeys.clear();
}
