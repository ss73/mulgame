import { boardKeys, claimId, decryptJson, encryptJson, hashAdmin, type BoardKeys } from './crypto';
import { configKey } from './game';
import type { KV } from './kv';

export interface BoardConfig {
  tables: number[];
  questions: number;
  size: number;
}

export interface Entry {
  nick: string;
  score: number;
  at: number;
}

export interface BoardDoc {
  v: 1;
  name: string;
  config: BoardConfig;
  adminHash: string;
  entries: Entry[];
  created: number;
}

interface Tombstone {
  v: 1;
  deleted: true;
}

export type LbErrorCode = 'not-found' | 'deleted' | 'name-taken' | 'not-owner' | 'network' | 'conflict';

export class LbError extends Error {
  constructor(readonly code: LbErrorCode) {
    super(code);
  }
}

export const DEFAULT_SIZE = 10;

export function sameNick(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

export function configMatches(config: BoardConfig, tables: number[], questions: number): boolean {
  return configKey(config.tables, config.questions) === configKey(tables, questions);
}

/** Inserts the entry keeping one (best) entry per nick. Returns the input array unchanged if it doesn't improve anything. */
export function insertEntry(entries: Entry[], size: number, entry: Entry): Entry[] {
  const existing = entries.find((e) => sameNick(e.nick, entry.nick));
  if (entry.score <= 0 || (existing && existing.score >= entry.score)) return entries;
  const next = entries.filter((e) => e !== existing).concat(entry);
  next.sort((a, b) => b.score - a.score || a.at - b.at);
  const top = next.slice(0, size);
  return top.includes(entry) ? top : entries;
}

export function qualifies(entries: Entry[], size: number, nick: string, score: number): boolean {
  return insertEntry(entries, size, { nick, score, at: Date.now() }) !== entries;
}

/** Lowest score currently on a full board, or 0 if there's room. */
export function scoreToBeat(doc: BoardDoc): number {
  return doc.entries.length < doc.config.size ? 0 : doc.entries[doc.entries.length - 1].score;
}

async function read(kv: KV, keys: BoardKeys): Promise<BoardDoc> {
  let raw: string | null;
  try {
    raw = await kv.get(keys.id);
  } catch {
    throw new LbError('network');
  }
  if (!raw) throw new LbError('not-found');
  let doc: BoardDoc | Tombstone;
  try {
    doc = await decryptJson(keys.key, raw);
  } catch {
    throw new LbError('not-found');
  }
  if ('deleted' in doc) throw new LbError('deleted');
  return doc;
}

async function write(kv: KV, id: string, value: string): Promise<void> {
  try {
    await kv.put(id, value);
  } catch {
    throw new LbError('network');
  }
}

async function getRaw(kv: KV, id: string): Promise<string | null> {
  try {
    return await kv.get(id);
  } catch {
    throw new LbError('network');
  }
}

export async function loadBoard(kv: KV, name: string, password: string): Promise<BoardDoc> {
  return read(kv, await boardKeys(name, password));
}

export async function createBoard(
  kv: KV,
  name: string,
  password: string,
  adminPassword: string,
  config: BoardConfig,
): Promise<{ doc: BoardDoc; adminHash: string }> {
  const claim = await claimId(name);
  if (await getRaw(kv, claim)) throw new LbError('name-taken');
  const keys = await boardKeys(name, password);
  try {
    await read(kv, keys);
    throw new LbError('name-taken');
  } catch (e) {
    if (!(e instanceof LbError) || (e.code !== 'not-found' && e.code !== 'deleted')) throw e;
  }
  const adminHash = await hashAdmin(name, adminPassword);
  const doc: BoardDoc = {
    v: 1,
    name: name.trim().replace(/\s+/g, ' '),
    config: { ...config, tables: [...config.tables].sort((a, b) => a - b) },
    adminHash,
    entries: [],
    created: Date.now(),
  };
  await write(kv, keys.id, await encryptJson(keys.key, doc));
  await write(kv, claim, '1');
  return { doc, adminHash };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Adds a score with read-merge-write, then re-reads to detect a concurrent
 * write that overwrote ours and retries. Returns the 1-based rank, or null
 * if the score doesn't make the board.
 */
export async function submitScore(
  kv: KV,
  name: string,
  password: string,
  nick: string,
  score: number,
  verifyDelayMs = 400,
): Promise<number | null> {
  const keys = await boardKeys(name, password);
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await read(kv, keys);
    const entries = insertEntry(doc.entries, doc.config.size, { nick: nick.trim(), score, at: Date.now() });
    if (entries === doc.entries) return null;
    await write(kv, keys.id, await encryptJson(keys.key, { ...doc, entries }));
    await sleep(verifyDelayMs * (1 + Math.random()));
    const check = await read(kv, keys);
    const rank = check.entries.findIndex((e) => sameNick(e.nick, nick) && e.score >= score);
    if (rank >= 0) return rank + 1;
  }
  throw new LbError('conflict');
}

/** Verifies the admin password and returns its hash for storing on this device. */
export async function verifyAdmin(kv: KV, name: string, password: string, adminPassword: string): Promise<string> {
  const doc = await loadBoard(kv, name, password);
  const hash = await hashAdmin(name, adminPassword);
  if (hash !== doc.adminHash) throw new LbError('not-owner');
  return hash;
}

export async function clearBoard(kv: KV, name: string, password: string, adminHash: string): Promise<void> {
  const keys = await boardKeys(name, password);
  const doc = await read(kv, keys);
  if (doc.adminHash !== adminHash) throw new LbError('not-owner');
  await write(kv, keys.id, await encryptJson(keys.key, { ...doc, entries: [] }));
}

export async function deleteBoard(kv: KV, name: string, password: string, adminHash: string): Promise<void> {
  const keys = await boardKeys(name, password);
  const doc = await read(kv, keys);
  if (doc.adminHash !== adminHash) throw new LbError('not-owner');
  const tombstone: Tombstone = { v: 1, deleted: true };
  await write(kv, keys.id, await encryptJson(keys.key, tombstone));
  await write(kv, await claimId(name), '');
}
