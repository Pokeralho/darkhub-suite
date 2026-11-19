/**
 * Runtime dictionary store. The app never loads every language: `loadLocale(lang)` pulls one chunk with the
 * dictionaries every screen needs (./locales/<lang>/index.ts), and the heavy, screen-specific ones
 * (SSH, PowerShell tools, Disk rescue) come with their lazy route through `withNamespace`.
 * `t()` stays synchronous: it only reads what is already here (main.tsx awaits the active language before
 * the first render, and a lazy route resolves only after its namespace is in).
 *
 * Merge order matches messages.ts (later parts win), so the result is identical to the old single bundle.
 */
import { shippedLanguages } from './languages';

export type Namespace = 'ssh' | 'psTools' | 'recovery';

type Dict = Record<string, string>;
type Parts = ReadonlyArray<readonly [number, Dict]>;

// Position of each on-demand dictionary in the merge order (see the list in messages.ts).
const NAMESPACE_ORDER: Record<Namespace, number> = { ssh: 2, psTools: 9, recovery: 31 };

// Literal import() calls so the bundler emits one chunk per language / per namespace and language.
const coreLoaders: Record<string, () => Promise<{ parts: Parts }>> = {
  'pt-BR': () => import('./locales/pt-BR/index'),
  'en-US': () => import('./locales/en-US/index')
};
const namespaceLoaders: Record<string, Record<Namespace, () => Promise<{ default: Dict }>>> = {
  'pt-BR': {
    ssh: () => import('./locales/pt-BR/ssh'),
    psTools: () => import('./locales/pt-BR/psTools'),
    recovery: () => import('./locales/pt-BR/recovery')
  },
  'en-US': {
    ssh: () => import('./locales/en-US/ssh'),
    psTools: () => import('./locales/en-US/psTools'),
    recovery: () => import('./locales/en-US/recovery')
  }
};

const parts = new Map<string, Map<number, Dict>>(); // lang -> order -> dict
const merged = new Map<string, Dict>();
const coreReady = new Set<string>();
const pending = new Map<string, Promise<void>>();
const wanted = new Set<Namespace>();
const listeners = new Set<() => void>();
let version = 0;

function rebuild(lang: string) {
  const byOrder = parts.get(lang);
  if (!byOrder) return;
  const dict: Dict = {};
  for (const order of [...byOrder.keys()].sort((a, b) => a - b)) Object.assign(dict, byOrder.get(order));
  merged.set(lang, dict);
  version++;
  listeners.forEach((fn) => fn());
}

function addParts(lang: string, list: Parts) {
  let byOrder = parts.get(lang);
  if (!byOrder) parts.set(lang, (byOrder = new Map()));
  for (const [order, dict] of list) byOrder.set(order, dict);
  rebuild(lang);
}

function once(key: string, run: () => Promise<void>): Promise<void> {
  const existing = pending.get(key);
  if (existing) return existing;
  const p = run().catch((err) => {
    pending.delete(key); // allow a retry (e.g. a chunk that failed to download)
    throw err;
  });
  pending.set(key, p);
  return p;
}

function loadNamespaceFor(lang: string, ns: Namespace): Promise<void> {
  const loader = namespaceLoaders[lang]?.[ns];
  if (!loader) return Promise.resolve();
  return once(`${lang}:${ns}`, async () => {
    const mod = await loader();
    // +0.5: its own slot right after the eager part of the same dictionary (sshEager, psToolsEager, recoveryEager
    // sit at NAMESPACE_ORDER in the core chunk). Sharing the slot made one replace the other: the eager keys
    // (sidebar labels, rescue.err.*) vanished once the screen loaded, and on a live language switch a core chunk
    // landing after the namespace dropped the whole screen dictionary.
    addParts(lang, [[NAMESPACE_ORDER[ns] + 0.5, mod.default]]);
  });
}

/** Built-in language whose dictionary backs `lang` (custom imported languages fall back to en-US). */
export function baseLanguage(lang: string): string {
  return shippedLanguages.includes(lang) ? lang : 'en-US';
}

/** Loads the startup dictionaries of `lang` plus every namespace already requested. Safe to call repeatedly. */
export function loadLocale(lang: string): Promise<void> {
  const base = baseLanguage(lang);
  const core = once(`${base}:core`, async () => {
    const mod = await coreLoaders[base]();
    coreReady.add(base);
    addParts(base, mod.parts);
  });
  return Promise.all([core, ...[...wanted].map((ns) => loadNamespaceFor(base, ns))]).then(() => undefined);
}

/** Requests a screen's dictionary for every language loaded so far (and for languages loaded later). */
export function loadNamespace(ns: Namespace): Promise<void> {
  wanted.add(ns);
  const langs = coreReady.size ? [...coreReady] : [];
  return Promise.all(langs.map((lang) => loadNamespaceFor(lang, ns))).then(() => undefined);
}

/** For React.lazy: resolve the page module only once its strings are in, so the first render is translated. */
export function withNamespace<T>(ns: Namespace, importer: () => Promise<T>): () => Promise<T> {
  return () =>
    Promise.all([importer(), loadNamespace(ns).catch(() => undefined)]).then(([mod]) => mod);
}

export function getDictionary(lang: string): Dict | undefined {
  return merged.get(lang);
}

export function isLocaleLoaded(lang: string): boolean {
  return coreReady.has(baseLanguage(lang));
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getVersion(): number {
  return version;
}

/** Tests: install every dictionary synchronously (the full `messages` object). */
export function seedAllForTests(all: Record<string, Dict>) {
  for (const [lang, dict] of Object.entries(all)) {
    coreReady.add(lang);
    addParts(lang, [[0, dict]]);
  }
  (Object.keys(NAMESPACE_ORDER) as Namespace[]).forEach((ns) => wanted.add(ns));
}

/** Tests: add strings on top of everything else (e.g. a key that exists in only one language). */
export function addStringsForTests(lang: string, dict: Dict) {
  addParts(lang, [[Number.MAX_SAFE_INTEGER, { ...(parts.get(lang)?.get(Number.MAX_SAFE_INTEGER) ?? {}), ...dict }]]);
}

// Vitest renders components without the async startup of main.tsx: give it every dictionary up front.
// `import.meta.env.MODE` is a build-time constant, so production builds drop this block (and the import).
if (import.meta.env.MODE === 'test') {
  const { messages } = await import('./messages');
  seedAllForTests(messages);
}
