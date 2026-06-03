import { describe, it, expect, beforeEach } from 'vitest';
import { draftKey, loadDraft, saveDraft, clearDraft } from './storage';

class InMemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

class QuotaStorage extends InMemoryStorage {
  setItem(_k: string, _v: string): void {
    throw new Error('QuotaExceeded');
  }
}

describe('draftKey', () => {
  it('is stable across input drugId order (sorted internally)', () => {
    const a = draftKey({ publishableKey: 'pk', drugIds: ['drug-A', 'drug-B'] });
    const b = draftKey({ publishableKey: 'pk', drugIds: ['drug-B', 'drug-A'] });
    expect(a).toBe(b);
  });

  it('differs when templateId differs', () => {
    const a = draftKey({ publishableKey: 'pk', drugIds: ['drug-A'], templateId: 't1' });
    const b = draftKey({ publishableKey: 'pk', drugIds: ['drug-A'], templateId: 't2' });
    expect(a).not.toBe(b);
  });

  it('differs when mode differs', () => {
    const a = draftKey({ publishableKey: 'pk', drugIds: ['drug-A'], mode: 'initial' });
    const b = draftKey({ publishableKey: 'pk', drugIds: ['drug-A'], mode: 'refill' });
    expect(a).not.toBe(b);
  });

  it('uses the token verbatim when present', () => {
    const k = draftKey({ publishableKey: 'pk', token: 'tok-XYZ' });
    expect(k).toContain('tok-XYZ');
  });
});

describe('save/load/clear', () => {
  let storage: InMemoryStorage;
  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  it('saveDraft → loadDraft round-trip', () => {
    const key = 'k';
    saveDraft(key, { answers: [{ questionId: 'q', value: 'a' }], stepIndex: 2 }, { storage });
    const loaded = loadDraft(key, { storage });
    expect(loaded?.stepIndex).toBe(2);
    expect(loaded?.answers).toEqual([{ questionId: 'q', value: 'a' }]);
  });

  it('returns null past TTL', () => {
    const key = 'k';
    storage.setItem(
      key,
      JSON.stringify({
        answers: [],
        stepIndex: 0,
        savedAt: Date.now() - 60 * 60 * 1000 - 1, // > 1h
      }),
    );
    expect(loadDraft(key, { storage, ttlMs: 60 * 60 * 1000 })).toBeNull();
    // Also evicts the expired draft
    expect(storage.getItem(key)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    storage.setItem('k', '{not json');
    expect(loadDraft('k', { storage })).toBeNull();
  });

  it('saveDraft is silent on storage quota errors', () => {
    expect(() =>
      saveDraft('k', { answers: [], stepIndex: 0 }, { storage: new QuotaStorage() }),
    ).not.toThrow();
  });

  it('SSR-safe — storage:null disables persistence cleanly', () => {
    expect(loadDraft('k', { storage: null })).toBeNull();
    expect(() => saveDraft('k', { answers: [], stepIndex: 0 }, { storage: null })).not.toThrow();
    expect(() => clearDraft('k', { storage: null })).not.toThrow();
  });

  it('clearDraft removes the key', () => {
    storage.setItem('k', JSON.stringify({ answers: [], stepIndex: 0, savedAt: Date.now() }));
    clearDraft('k', { storage });
    expect(storage.getItem('k')).toBeNull();
  });
});
