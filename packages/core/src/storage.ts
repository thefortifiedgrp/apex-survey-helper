import type { V2Answer } from './types';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = 'apex:draft:v1';

export interface Draft {
  answers: V2Answer[];
  stepIndex: number;
  savedAt: number;
}

export interface StorageOptions {
  /** Storage to back the draft (defaults to `window.localStorage` when available). */
  storage?: Storage | null;
  /** Override TTL (default 24 hours). */
  ttlMs?: number;
}

/**
 * Resolves the Storage to use. Wrapped in a try/catch because hosts can disable
 * localStorage entirely (Safari private mode, hardened browsers) — we want the
 * survey to still work, just without resume-on-refresh.
 */
function resolveStorage(opts: StorageOptions): Storage | null {
  if (opts.storage === null) return null;
  if (opts.storage) return opts.storage;
  try {
    if (typeof window === 'undefined') return null;
    const ls = window.localStorage;
    const probe = '__apex_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/** Stable short hash of the survey-identity inputs. */
function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function draftKey(opts: {
  /**
   * Top-level namespace so multiple partners on the same domain don't collide.
   * Use `publishableKey` for browser-direct embeds; fall back to `tenantKey`
   * when proxying through a partner backend (no publishable key in the
   * browser). Either is enough to uniquely identify the partner.
   */
  publishableKey?: string;
  tenantKey?: string;
  token?: string;
  drugIds?: string[];
  templateId?: string;
  mode?: string;
}): string {
  const surveyKey = opts.token
    ? `tok:${opts.token}`
    : shortHash(
        JSON.stringify({
          d: [...(opts.drugIds ?? [])].sort(),
          t: opts.templateId ?? null,
          m: opts.mode ?? 'initial',
        }),
      );
  const namespace = opts.publishableKey ?? opts.tenantKey ?? 'anon';
  return `${PREFIX}:${namespace}:${surveyKey}`;
}

export function loadDraft(key: string, opts: StorageOptions = {}): Draft | null {
  const storage = resolveStorage(opts);
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > ttl) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(
  key: string,
  draft: Omit<Draft, 'savedAt'>,
  opts: StorageOptions = {},
): void {
  const storage = resolveStorage(opts);
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* quota / disabled — silently skip */
  }
}

export function clearDraft(key: string, opts: StorageOptions = {}): void {
  const storage = resolveStorage(opts);
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}
