export const TABLES = [2, 3, 4, 5, 6, 7, 8, 9];
export const QUESTION_COUNTS = [10, 20, 30];

// Each question starts at 1000 points and loses 60 per second down to 100,
// matching the original game (1 point per frame at 60 fps).
export const POINTS_START = 1000;
export const POINTS_MIN = 100;
const POINTS_PER_MS = 0.06;

export type Question = [table: number, factor: number];

export function pointsAt(elapsedMs: number): number {
  return Math.max(POINTS_MIN, Math.round(POINTS_START - elapsedMs * POINTS_PER_MS));
}

export function makeQuestions(tables: number[], count: number, rng: () => number = Math.random): Question[] {
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const factors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const out: Question[] = [];
  while (out.length < count) {
    const q: Question = [pick(tables), pick(factors)];
    const prev = out[out.length - 1];
    if (prev && prev[0] === q[0] && prev[1] === q[1]) continue;
    out.push(q);
  }
  return out;
}

export function configKey(tables: number[], questions: number): string {
  return `${[...tables].sort((a, b) => a - b).join(',')}|${questions}`;
}
