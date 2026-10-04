import { h, segmented, show, tablePicker } from '../dom';
import { QUESTION_COUNTS, TABLES } from '../game';
import { t } from '../i18n';
import * as local from '../local';
import { boardScreen } from './board';
import { configSummary } from './common';
import { createScreen, joinScreen } from './forms';
import { playScreen } from './play';
import { settingsScreen } from './settings';

export function homeScreen(): void {
  show((root) => {
    const { lastPick, boards } = local.get();
    let tables = lastPick.tables;
    let questions = lastPick.questions;

    const start = h('button', {
      class: 'btn primary big',
      onclick: () => {
        local.update((s) => (s.lastPick = { tables, questions }));
        playScreen({ tables, questions });
      },
    }, t('start'));

    const picker = tablePicker(TABLES, tables, (picked) => {
      tables = picked;
      start.disabled = picked.length === 0;
    });

    const boardCards = boards.map((b) =>
      h(
        'li',
        { class: 'board-card' },
        h(
          'button',
          { class: 'board-open', onclick: () => boardScreen(b.name) },
          h('strong', {}, b.name),
          b.config ? h('span', { class: 'muted' }, configSummary(b.config)) : null,
        ),
        b.config
          ? h('button', { class: 'btn primary small', onclick: () => playScreen({ tables: b.config!.tables, questions: b.config!.questions }) }, t('play'))
          : null,
      ),
    );

    root.append(
      h(
        'header',
        { class: 'topbar home' },
        h('h1', { class: 'logo' }, h('span', {}, '×'), ' ', t('appName')),
        h('button', { class: 'icon-btn', 'aria-label': t('settings'), onclick: settingsScreen }, '⚙︎'),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, t('pickTables')),
        picker,
        h('h3', {}, t('numQuestions')),
        segmented(QUESTION_COUNTS, questions, (v) => (questions = v), t('numQuestions')),
        start,
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, '🏆 ', t('leaderboards')),
        boardCards.length
          ? h('ul', { class: 'board-list' }, ...boardCards)
          : h('p', { class: 'muted' }, t('noBoardsYet')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => joinScreen() }, t('joinBoard')),
          h('button', { class: 'btn', onclick: () => createScreen() }, t('createBoard')),
        ),
      ),
    );
  });
}
