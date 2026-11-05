import type { LocalStore } from './local/local-store.ts';

/**
 * The published content on the device, so lessons and scenarios open without a network.
 *
 * Start-up (`loadStartupDocument`) uses, in order:
 * 1. the copy cached on this device — the last document downloaded and validated;
 * 2. on a device with no copy yet, the server, if it answers within a short budget;
 * 3. the starter content bundled with the app (src/content/bundled.ts) — the whole published library at build time.
 * Each candidate must pass the same validation the server copy always passed (`validate`); one that doesn't is
 * skipped, so a corrupted or incompatible cache can never stop the app from starting.
 *
 * Afterwards `refreshDocument` downloads the current document in the background. A document whose version (a hash of
 * its contents) matches the stored one changes nothing. A new one is validated first and only then stored, in one
 * atomic write that replaces the old copy — never a partial document. It is installed at the next start, so nobody's
 * lesson changes underneath them. A failed or invalid download leaves the cached copy exactly as it was: content is
 * never deleted because the device is offline.
 */

export type ContentSource = 'cache' | 'network' | 'bundled';

export interface DocumentSource<T> {
  /** Cache key: 'catalog' or 'categories'. */
  key: string;
  fetch: () => Promise<unknown>;
  /** The bundled starter document, if this kind has one. */
  bundled?: () => unknown;
  /** Validate and build. Null when the document doesn't pass. */
  validate: (doc: unknown) => T | null;
  /** The content's own revision number, kept alongside for diagnosis. */
  revision?: (doc: unknown) => number;
}

export interface Loaded<T> {
  value: T;
  source: ContentSource;
  /** The loaded document's version (null for the bundled copy). */
  version: string | null;
}

/** FNV-1a over the document's JSON: equal versions mean byte-identical documents. */
export function contentVersion(doc: unknown): string {
  const text = JSON.stringify(doc) ?? '';
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}-${text.length.toString(36)}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('content: timeout')), ms);
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e: unknown) => (clearTimeout(timer), reject(e)),
    );
  });
}

async function store<T>(local: LocalStore, src: DocumentSource<T>, doc: unknown, now: number): Promise<void> {
  await local.saveContent(src.key, { version: contentVersion(doc), revision: src.revision?.(doc) ?? 0, payload: doc, fetchedAt: now });
}

/**
 * The document to start with. Throws only when there is no usable copy anywhere (no cache, no answer from the server,
 * nothing bundled): the error is the server's, so the start-up screen can say a connection is needed once.
 */
export async function loadStartupDocument<T>(local: LocalStore, src: DocumentSource<T>, opts: { networkBudgetMs?: number; now?: () => number } = {}): Promise<Loaded<T>> {
  const cached = await local.loadContent(src.key).catch(() => null);
  if (cached) {
    const value = src.validate(cached.payload);
    // A cached copy that no longer validates (an app update changed the engines, a damaged row) is skipped; the next
    // successful refresh replaces it.
    if (value) return { value, source: 'cache', version: cached.version };
  }

  let networkError: unknown = null;
  try {
    const doc = await withTimeout(src.fetch(), opts.networkBudgetMs ?? 6000);
    const value = src.validate(doc);
    if (value) {
      await store(local, src, doc, (opts.now ?? Date.now)()).catch(() => undefined);
      return { value, source: 'network', version: contentVersion(doc) };
    }
    networkError = new Error(`content: the server's ${src.key} did not validate`);
  } catch (e) {
    networkError = e;
  }

  const bundled = src.bundled?.();
  if (bundled) {
    const value = src.validate(bundled);
    if (value) return { value, source: 'bundled', version: null };
  }
  throw networkError;
}

export type RefreshResult = 'unchanged' | 'updated' | 'invalid' | 'failed';

/** Download the current document and store it if it is new and valid. Never throws; never removes the cached copy. */
export async function refreshDocument<T>(local: LocalStore, src: DocumentSource<T>, now: () => number = Date.now): Promise<RefreshResult> {
  let doc: unknown;
  try {
    doc = await src.fetch();
  } catch {
    return 'failed';
  }
  try {
    const cached = await local.loadContent(src.key).catch(() => null);
    if (cached && cached.version === contentVersion(doc)) return 'unchanged';
    if (!src.validate(doc)) return 'invalid';
    await store(local, src, doc, now());
    return 'updated';
  } catch {
    return 'failed';
  }
}
