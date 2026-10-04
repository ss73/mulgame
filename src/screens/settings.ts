import { busy, confirmDialog, h, modal, promptDialog, show, toast, topbar } from '../dom';
import { setLanguage, t } from '../i18n';
import { textdb } from '../kv';
import { clearBoard, deleteBoard, LbError, verifyAdmin } from '../leaderboard';
import * as local from '../local';
import type { JoinedBoard, LangSetting } from '../local';
import { boardScreen } from './board';
import { configSummary, errorText } from './common';
import { createScreen, joinScreen } from './forms';
import { homeScreen } from './home';
import { nickDialog } from './result';

export function settingsScreen(): void {
  show((root) => {
    const s = local.get();

    const nickValue = h('strong', {}, s.nick || t('noNickYet'));
    const editNick = h('button', {
      class: 'btn small',
      onclick: async () => {
        const v = await nickDialog(t('nickname'), t('nickHelp'));
        if (v) {
          local.update((st) => (st.nick = v));
          nickValue.textContent = v;
        }
      },
    }, t('edit'));

    const lang = h(
      'select',
      {
        onchange: () => {
          local.update((st) => (st.lang = lang.value as LangSetting));
          setLanguage(lang.value as LangSetting);
          settingsScreen();
        },
      },
      ...(['auto', 'en', 'sv'] as const).map((v) => h('option', { value: v, selected: s.lang === v }, t(`lang.${v}`))),
    );

    root.append(
      topbar(t('settings'), homeScreen),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, t('profile')),
        h('div', { class: 'setting-row' }, h('span', {}, t('nickname')), nickValue, editNick),
        h('label', { class: 'setting-row' }, h('span', {}, t('language')), lang),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', {}, t('myBoards')),
        s.boards.length
          ? h('ul', { class: 'manage-list' }, ...s.boards.map(boardItem))
          : h('p', { class: 'muted' }, t('noBoardsYet')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => joinScreen(undefined, settingsScreen) }, t('joinBoard')),
          h('button', { class: 'btn', onclick: () => createScreen(settingsScreen) }, t('createBoard')),
        ),
      ),
    );
  });
}

function boardItem(b: JoinedBoard): HTMLElement {
  const owner = !!b.adminHash;
  const btn = (label: string, action: (el: HTMLButtonElement) => unknown, cls = '') => {
    const el: HTMLButtonElement = h('button', { class: `btn small ${cls}`, onclick: () => action(el) }, label);
    return el;
  };

  const onLostBoard = (e: unknown) => {
    toast(errorText(e));
    if (e instanceof LbError && e.code === 'deleted') {
      local.removeBoard(b.name);
      settingsScreen();
    }
  };

  const actions = [
    btn(t('open'), () => boardScreen(b.name)),
    owner
      ? btn(t('clearBoard'), async (el) => {
          if (!(await confirmDialog(t('clearConfirm', { name: b.name }), t('clearBoard'), true))) return;
          try {
            await busy(el, () => clearBoard(textdb, b.name, b.password, b.adminHash!));
            toast(t('boardCleared'));
          } catch (e) {
            onLostBoard(e);
          }
        })
      : btn(t('iAmOwner'), async () => {
          const admin = await promptAdmin(b);
          if (admin) {
            local.upsertBoard({ ...b, adminHash: admin.hash, adminPassword: admin.password });
            toast(t('ownerConfirmed'));
            settingsScreen();
          }
        }),
    owner
      ? btn(t('deleteBoard'), async (el) => {
          if (!(await confirmDialog(t('deleteConfirm', { name: b.name }), t('deleteBoard'), true))) return;
          try {
            await busy(el, () => deleteBoard(textdb, b.name, b.password, b.adminHash!));
            local.removeBoard(b.name);
            toast(t('boardDeleted'));
            settingsScreen();
          } catch (e) {
            onLostBoard(e);
          }
        }, 'danger')
      : null,
    owner ? btn(t('showAdminPassword'), () => showAdminPassword(b)) : null,
    owner
      ? null
      : btn(t('leave'), async () => {
          if (!(await confirmDialog(t('leaveConfirm', { name: b.name }), t('leave')))) return;
          local.removeBoard(b.name);
          settingsScreen();
        }),
  ];

  return h(
    'li',
    { class: 'manage-item' },
    h(
      'div',
      { class: 'manage-head' },
      h('strong', {}, b.name),
      owner ? h('span', { class: 'tag' }, t('owner')) : null,
    ),
    b.config ? h('p', { class: 'muted' }, configSummary(b.config), ' · ', t('topN', { n: b.config.size })) : null,
    h('div', { class: 'row wrap' }, ...actions.filter((a) => a !== null)),
  );
}

function showAdminPassword(b: JoinedBoard): Promise<void> {
  return modal<void>(
    (close) => [
      h('h2', {}, t('adminPassword')),
      ...(b.adminPassword
        ? [h('p', { class: 'secret' }, b.adminPassword), h('p', { class: 'hint' }, t('adminPasswordLocalOnly'))]
        : [h('p', { class: 'modal-msg' }, t('adminPasswordNotSaved'))]),
      h('button', { class: 'btn primary', onclick: () => close() }, t('ok')),
    ],
    undefined,
  );
}

async function promptAdmin(b: JoinedBoard): Promise<{ hash: string; password: string } | null> {
  let hash: string | null = null;
  const ok = await promptDialog({
    title: t('iAmOwner'),
    message: t('enterAdminPassword', { name: b.name }),
    label: t('adminPassword'),
    type: 'password',
    okLabel: t('confirm'),
    validate: async (v) => {
      if (!v) return t('required');
      try {
        hash = await verifyAdmin(textdb, b.name, b.password, v);
        return null;
      } catch (e) {
        return errorText(e);
      }
    },
  });
  return ok && hash ? { hash, password: ok } : null;
}
