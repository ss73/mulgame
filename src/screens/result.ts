import { h, promptDialog, show } from '../dom';
import { configKey } from '../game';
import { t } from '../i18n';
import { textdb } from '../kv';
import { configMatches, loadBoard, qualifies, sameNick, scoreToBeat, submitScore, type BoardDoc } from '../leaderboard';
import * as local from '../local';
import type { JoinedBoard } from '../local';
import { boardScreen } from './board';
import { errorText } from './common';
import { homeScreen } from './home';
import { playScreen, type GameSetup } from './play';

export interface GameResult {
  setup: GameSetup;
  total: number;
  correct: number;
  count: number;
}

export const NICK_MAX = 16;

export function nickDialog(title: string, message?: string): Promise<string | null> {
  return promptDialog({
    title,
    message,
    label: t('nickname'),
    value: local.get().nick,
    maxLength: NICK_MAX,
    okLabel: t('save'),
  });
}

export function resultScreen(r: GameResult): void {
  show((root) => {
    const key = configKey(r.setup.tables, r.setup.questions);
    const previousBest = local.get().best[key] ?? 0;
    const newBest = r.total > previousBest;
    if (newBest) local.update((s) => (s.best[key] = r.total));

    const boardsBox = h('section', { class: 'card board-results', hidden: true });
    root.append(
      h(
        'section',
        { class: 'card result' },
        h('h2', {}, t('yourScore')),
        h('div', { class: 'score-big' }, r.total),
        h('p', {}, t('correctOf', { n: r.correct, total: r.count })),
        newBest && previousBest > 0 ? h('p', { class: 'badge-best' }, '⭐ ', t('newBest')) : null,
        !newBest ? h('p', { class: 'muted' }, t('yourBest', { points: previousBest })) : null,
      ),
      boardsBox,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: homeScreen }, t('home')),
        h('button', { class: 'btn primary', onclick: () => playScreen(r.setup) }, t('playAgain')),
      ),
    );

    let alive = true;
    void reportToBoards(r, boardsBox, () => alive);
    return () => {
      alive = false;
    };
  });
}

async function reportToBoards(r: GameResult, box: HTMLElement, alive: () => boolean): Promise<void> {
  const boards = local.get().boards.filter((b) => b.config && configMatches(b.config, r.setup.tables, r.setup.questions));
  if (!boards.length || r.total <= 0) return;

  box.hidden = false;
  const list = h('ul', { class: 'board-list' });
  box.append(h('h2', {}, '🏆 ', t('leaderboards')), list);
  const status = new Map<JoinedBoard, HTMLElement>();
  for (const b of boards) {
    const s = h('span', { class: 'status muted' }, t('checking'));
    status.set(b, s);
    list.append(h('li', { class: 'board-card' }, h('button', { class: 'board-open', onclick: () => boardScreen(b.name) }, h('strong', {}, b.name), s)));
  }
  const setStatus = (b: JoinedBoard, text: string, cls = 'muted') => {
    const s = status.get(b)!;
    s.textContent = text;
    s.className = `status ${cls}`;
  };

  const loaded = await Promise.all(
    boards.map(async (b) => {
      try {
        return { b, doc: await loadBoard(textdb, b.name, b.password) };
      } catch (e) {
        setStatus(b, errorText(e), 'error');
        return null;
      }
    }),
  );
  let nick = local.get().nick;
  const made = (x: { doc: BoardDoc } | null): x is { b: JoinedBoard; doc: BoardDoc } =>
    !!x && qualifies(x.doc.entries, x.doc.config.size, nick || '\u0000', r.total);
  const qualified = loaded.filter(made);
  for (const x of loaded) {
    if (!x || qualified.includes(x)) continue;
    const mine = nick ? x.doc.entries.find((e) => sameNick(e.nick, nick)) : undefined;
    setStatus(x.b, mine ? t('alreadyBetter', { points: mine.score }) : t('notThisTime', { points: scoreToBeat(x.doc) }));
  }
  if (!qualified.length || !alive()) return;

  if (!nick) {
    const chosen = await nickDialog(t('madeTheBoard'), t('chooseNick'));
    if (!chosen) {
      qualified.forEach((x) => setStatus(x.b, t('skipped')));
      return;
    }
    nick = chosen;
    local.update((s) => (s.nick = chosen));
  }

  await Promise.all(
    qualified.map(async ({ b }) => {
      setStatus(b, t('saving'));
      try {
        const rank = await submitScore(textdb, b.name, b.password, nick, r.total);
        if (rank) setStatus(b, t('rankOn', { rank }), 'success');
        else setStatus(b, t('notOnBoard'));
      } catch (e) {
        setStatus(b, errorText(e), 'error');
      }
    }),
  );
}
