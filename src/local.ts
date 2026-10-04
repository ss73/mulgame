import { normalizeName } from './crypto';
import type { BoardConfig } from './leaderboard';

export type LangSetting = 'auto' | 'en' | 'sv';

export interface JoinedBoard {
  name: string;
  password: string;
  /** Cached from the last successful load; used to match finished games to boards. */
  config?: BoardConfig;
  /** Present when this device has proven ownership. */
  adminHash?: string;
  /** Kept only on this device so the owner can look it up; never sent to the store. */
  adminPassword?: string;
}

interface LocalState {
  nick: string;
  lang: LangSetting;
  boards: JoinedBoard[];
  best: Record<string, number>;
  lastPick: { tables: number[]; questions: number };
}

const KEY = 'mulgame.v1';

const defaults = (): LocalState => ({
  nick: '',
  lang: 'auto',
  boards: [],
  best: {},
  lastPick: { tables: [2, 3, 4, 5], questions: 20 },
});

let state: LocalState = load();

function load(): LocalState {
  try {
    return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults();
  }
}

export function get(): Readonly<LocalState> {
  return state;
}

export function update(fn: (s: LocalState) => void): void {
  fn(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage full: keep working in memory.
  }
}

export function findBoard(name: string): JoinedBoard | undefined {
  const n = normalizeName(name);
  return state.boards.find((b) => normalizeName(b.name) === n);
}

export function upsertBoard(board: JoinedBoard): void {
  update((s) => {
    const n = normalizeName(board.name);
    const i = s.boards.findIndex((b) => normalizeName(b.name) === n);
    if (i >= 0) s.boards[i] = { ...s.boards[i], ...board };
    else s.boards.push(board);
  });
}

export function removeBoard(name: string): void {
  const n = normalizeName(name);
  update((s) => {
    s.boards = s.boards.filter((b) => normalizeName(b.name) !== n);
  });
}
