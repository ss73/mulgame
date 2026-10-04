import QRCode from 'qrcode';
import { busy, h, show, toast, topbar } from '../dom';
import { t } from '../i18n';
import { textdb } from '../kv';
import { LbError, loadBoard, sameNick, type BoardDoc } from '../leaderboard';
import * as local from '../local';
import type { JoinedBoard } from '../local';
import { configSummary, errorText, joinLink } from './common';
import { homeScreen } from './home';
import { playScreen } from './play';

const MEDALS = ['🥇', '🥈', '🥉'];

export function boardScreen(name: string, openInvite = false): void {
  const board = local.findBoard(name);
  if (!board) return homeScreen();

  show((root) => {
    const info = h('p', { class: 'muted' }, board.config ? configSummary(board.config) : '');
    const list = h('ol', { class: 'lb-list' });
    const status = h('p', { class: 'muted center' }, t('loading'));
    const play = h('button', { class: 'btn primary', disabled: !board.config }, t('play'));
    const refresh = h('button', { class: 'btn', onclick: () => busy(refresh, load) }, t('refresh'));
    play.addEventListener('click', () => board.config && playScreen(board.config));

    root.append(
      topbar(board.name, homeScreen),
      h('section', { class: 'card' }, info, status, list, h('div', { class: 'row' }, refresh, play)),
      inviteSection(board, openInvite),
    );

    let alive = true;
    async function load() {
      try {
        const doc = await loadBoard(textdb, board!.name, board!.password);
        if (!alive) return;
        local.upsertBoard({ name: doc.name, password: board!.password, config: doc.config });
        info.textContent = `${configSummary(doc.config)} · ${t('topN', { n: doc.config.size })}`;
        play.disabled = false;
        renderEntries(doc);
      } catch (e) {
        if (!alive) return;
        status.hidden = false;
        status.textContent = errorText(e);
        status.className = 'error center';
        if (e instanceof LbError && e.code === 'deleted') local.removeBoard(board!.name);
      }
    }

    function renderEntries(doc: BoardDoc) {
      const nick = local.get().nick;
      status.hidden = doc.entries.length > 0;
      status.className = 'muted center';
      status.textContent = t('emptyBoard');
      list.replaceChildren(
        ...doc.entries.map((e, i) =>
          h(
            'li',
            { class: nick && sameNick(e.nick, nick) ? 'me' : '' },
            h('span', { class: 'rank' }, MEDALS[i] ?? i + 1),
            h('span', { class: 'nick' }, e.nick),
            h('span', { class: 'pts' }, e.score),
          ),
        ),
      );
    }

    void load();
    return () => {
      alive = false;
    };
  });
}

function inviteSection(board: JoinedBoard, open: boolean): HTMLElement {
  const link = joinLink(board.name, board.password);
  const qr = h('div', { class: 'qr', 'aria-label': t('qrAlt'), role: 'img' });
  QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) => (qr.innerHTML = svg));

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: board.name, text: t('shareText', { name: board.name }), url: link });
      } catch {
        // Cancelled by the user.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast(t('linkCopied'));
    } catch {
      prompt(t('copyThisLink'), link);
    }
  };

  return h(
    'details',
    { class: 'card invite', open },
    h('summary', {}, t('inviteFriends')),
    h('p', { class: 'muted' }, t('inviteHelp')),
    qr,
    h('dl', { class: 'creds' }, h('dt', {}, t('boardName')), h('dd', {}, board.name), h('dt', {}, t('password')), h('dd', {}, board.password)),
    h('button', { class: 'btn', onclick: share }, t('shareLink')),
  );
}
