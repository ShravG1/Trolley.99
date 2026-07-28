import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadCategoryMemory, saveCategoryMemory } from './categoryMemory';

// A throwaway localStorage. The node test env has none, so install one — and
// prove the lib copes when it's absent, hostile or full.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const GID = 'group-1';
const KEY = `trolley.itemCats.${GID}`;

declare const globalThis: { localStorage?: unknown };

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});
afterEach(() => {
  delete globalThis.localStorage;
});

describe('categoryMemory persistence', () => {
  it('round-trips a map', () => {
    saveCategoryMemory(GID, { 'oat milk': 'dairy', hummus: 'cupboard' });
    expect(loadCategoryMemory(GID)).toEqual({ 'oat milk': 'dairy', hummus: 'cupboard' });
  });

  it('is scoped per group — one household never sees another/s', () => {
    saveCategoryMemory(GID, { 'oat milk': 'dairy' });
    expect(loadCategoryMemory('group-2')).toEqual({});
  });

  it('clears the key rather than storing an empty object', () => {
    saveCategoryMemory(GID, { 'oat milk': 'dairy' });
    saveCategoryMemory(GID, {});
    expect((globalThis.localStorage as MemoryStorage).getItem(KEY)).toBeNull();
  });

  it('returns {} when there is nothing stored', () => {
    expect(loadCategoryMemory(GID)).toEqual({});
  });
});

describe('categoryMemory rejects untrusted input', () => {
  // localStorage is user-writable: a hand-edited blob must degrade to "no
  // memory", never to an aisle key that would index AISLES[…] as undefined.
  const put = (v: string) => (globalThis.localStorage as MemoryStorage).setItem(KEY, v);

  it('drops entries whose aisle key is unknown', () => {
    put(JSON.stringify({ milk: 'dairy', poison: 'not-an-aisle', nope: 42 }));
    expect(loadCategoryMemory(GID)).toEqual({ milk: 'dairy' });
  });

  it('ignores prototype-ish keys carried in JSON', () => {
    put('{"__proto__":"dairy","constructor":"dairy","milk":"dairy"}');
    const mem = loadCategoryMemory(GID);
    expect(mem).toEqual({ milk: 'dairy' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('survives malformed JSON', () => {
    put('{not json');
    expect(loadCategoryMemory(GID)).toEqual({});
  });

  it('rejects a non-object payload', () => {
    put('["dairy"]');
    expect(loadCategoryMemory(GID)).toEqual({});
    put('"dairy"');
    expect(loadCategoryMemory(GID)).toEqual({});
  });

  it('drops absurdly long names rather than caching them', () => {
    put(JSON.stringify({ ['x'.repeat(500)]: 'dairy', milk: 'dairy' }));
    expect(loadCategoryMemory(GID)).toEqual({ milk: 'dairy' });
  });

  it('caps how much it will mirror locally', () => {
    const huge: Record<string, string> = {};
    for (let i = 0; i < 700; i++) huge[`item ${i}`] = 'dairy';
    put(JSON.stringify(huge));
    expect(Object.keys(loadCategoryMemory(GID)).length).toBe(500);
  });
});

describe('categoryMemory without storage', () => {
  it('no-ops when localStorage is unavailable (private mode, SSR)', () => {
    delete globalThis.localStorage;
    expect(loadCategoryMemory(GID)).toEqual({});
    expect(() => saveCategoryMemory(GID, { milk: 'dairy' })).not.toThrow();
  });

  it('swallows a storage that throws (quota exceeded)', () => {
    globalThis.localStorage = {
      getItem() {
        throw new Error('nope');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('nope');
      },
    };
    expect(loadCategoryMemory(GID)).toEqual({});
    expect(() => saveCategoryMemory(GID, { milk: 'dairy' })).not.toThrow();
  });
});
