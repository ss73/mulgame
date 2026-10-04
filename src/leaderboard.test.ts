import { describe, expect, it } from 'vitest';
import { makeQuestions, pointsAt } from './game';
import { memoryKV } from './kv';
import {
  clearBoard,
  createBoard,
  deleteBoard,
  insertEntry,
  LbError,
  loadBoard,
  qualifies,
  submitScore,
  verifyAdmin,
  type Entry,
} from './leaderboard';

const config = { tables: [7, 3], questions: 20, size: 3 };

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof LbError ? e.code : String(e);
  }
}

describe('game', () => {
  it('scores decay from 1000 to a floor of 100', () => {
    expect(pointsAt(0)).toBe(1000);
    expect(pointsAt(5000)).toBe(700);
    expect(pointsAt(60_000)).toBe(100);
  });

  it('makes questions from the chosen tables without immediate repeats', () => {
    const qs = makeQuestions([4, 6], 200);
    expect(qs).toHaveLength(200);
    for (const [t, f] of qs) {
      expect([4, 6]).toContain(t);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(10);
    }
    for (let i = 1; i < qs.length; i++) expect(qs[i]).not.toEqual(qs[i - 1]);
  });
});

describe('insertEntry', () => {
  const e = (nick: string, score: number, at = 0): Entry => ({ nick, score, at });

  it('keeps the best score per nick, case-insensitively', () => {
    const entries = [e('Ann', 500)];
    expect(insertEntry(entries, 3, e('ann', 400))).toBe(entries);
    expect(insertEntry(entries, 3, e('ANN', 600))).toEqual([e('ANN', 600)]);
  });

  it('only admits scores that make the top N', () => {
    const full = [e('a', 900), e('b', 800), e('c', 700)];
    expect(qualifies(full, 3, 'd', 700)).toBe(false); // ties go to the earlier entry
    expect(qualifies(full, 3, 'd', 701)).toBe(true);
    expect(insertEntry(full, 3, e('d', 850)).map((x) => x.nick)).toEqual(['a', 'd', 'b']);
    expect(qualifies([], 3, 'd', 0)).toBe(false);
  });
});

describe('board storage', () => {
  it('creates, reads, scores, clears and deletes', async () => {
    const kv = memoryKV();
    const { adminHash } = await createBoard(kv, 'Klass 3B', 'kanin', 'admin1', config);
    // Nothing readable is stored in the clear.
    expect([...kv.data.values()].join()).not.toMatch(/Klass|kanin/);

    const doc = await loadBoard(kv, '  klass   3b ', 'kanin');
    expect(doc.name).toBe('Klass 3B');
    expect(doc.config.tables).toEqual([3, 7]);

    expect(await code(loadBoard(kv, 'Klass 3B', 'wrong'))).toBe('not-found');
    expect(await code(createBoard(kv, 'KLASS 3b', 'other', 'x', config))).toBe('name-taken');

    expect(await submitScore(kv, 'Klass 3B', 'kanin', 'Ann', 5000, 0)).toBe(1);
    expect(await submitScore(kv, 'Klass 3B', 'kanin', 'Bo', 6000, 0)).toBe(1);
    expect(await submitScore(kv, 'Klass 3B', 'kanin', 'ann', 4000, 0)).toBeNull();
    expect((await loadBoard(kv, 'Klass 3B', 'kanin')).entries.map((x) => x.nick)).toEqual(['Bo', 'Ann']);

    expect(await code(verifyAdmin(kv, 'Klass 3B', 'kanin', 'nope'))).toBe('not-owner');
    expect(await verifyAdmin(kv, 'Klass 3B', 'kanin', 'admin1')).toBe(adminHash);
    expect(await code(clearBoard(kv, 'Klass 3B', 'kanin', 'bogus'))).toBe('not-owner');
    await clearBoard(kv, 'Klass 3B', 'kanin', adminHash);
    expect((await loadBoard(kv, 'Klass 3B', 'kanin')).entries).toEqual([]);

    await deleteBoard(kv, 'Klass 3B', 'kanin', adminHash);
    expect(await code(loadBoard(kv, 'Klass 3B', 'kanin'))).toBe('deleted');
    // The name is free again.
    expect(await code(createBoard(kv, 'Klass 3B', 'ny', 'admin2', config))).toBe('ok');
  });

  it('merges concurrent submissions', async () => {
    const kv = memoryKV();
    await createBoard(kv, 'Race', 'pw12', 'admin', { ...config, size: 10 });
    const nicks = ['a', 'b', 'c', 'd', 'e'];
    const ranks = await Promise.all(nicks.map((n, i) => submitScore(kv, 'Race', 'pw12', n, 1000 + i, 5)));
    expect(ranks.every((r) => r !== null)).toBe(true);
    const doc = await loadBoard(kv, 'Race', 'pw12');
    expect(doc.entries.map((x) => x.nick).sort()).toEqual(nicks);
  });

  it('reports network failures', async () => {
    const broken = { get: () => Promise.reject(new Error('offline')), put: () => Promise.reject(new Error('offline')) };
    expect(await code(loadBoard(broken, 'x', 'y'))).toBe('network');
  });
});
