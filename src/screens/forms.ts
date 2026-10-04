import { busy, field, h, segmented, show, tablePicker, toast, topbar } from '../dom';
import { QUESTION_COUNTS, TABLES } from '../game';
import { t } from '../i18n';
import { textdb } from '../kv';
import { createBoard, DEFAULT_SIZE, loadBoard } from '../leaderboard';
import * as local from '../local';
import { boardScreen } from './board';
import { errorText } from './common';
import { homeScreen } from './home';

const NAME_MIN = 3;
const NAME_MAX = 30;
const PASSWORD_MIN = 4;
const SIZE_MIN = 3;
const SIZE_MAX = 50;

export function createScreen(back: () => void = homeScreen): void {
  show((root) => {
    let tables = local.get().lastPick.tables;
    let questions = 20;
    const name = field(t('boardName'), { maxLength: NAME_MAX, required: true });
    const password = field(t('joinPassword'), { required: true });
    const admin = field(t('adminPassword'), { type: 'password', required: true });
    const size = field(t('boardSize'), { type: 'number', inputmode: 'numeric', min: SIZE_MIN, max: SIZE_MAX, value: String(DEFAULT_SIZE) });
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, t('createBoard'));

    function validate(): string | null {
      const n = name.input.value.trim();
      if (n.length < NAME_MIN) return t('nameTooShort', { n: NAME_MIN });
      if (password.input.value.trim().length < PASSWORD_MIN || admin.input.value.trim().length < PASSWORD_MIN)
        return t('passwordTooShort', { n: PASSWORD_MIN });
      if (password.input.value.trim() === admin.input.value.trim()) return t('passwordsMustDiffer');
      if (!tables.length) return t('pickAtLeastOne');
      const s = Number(size.input.value);
      if (!Number.isInteger(s) || s < SIZE_MIN || s > SIZE_MAX) return t('sizeRange', { min: SIZE_MIN, max: SIZE_MAX });
      return null;
    }

    async function onSubmit(e: Event) {
      e.preventDefault();
      const problem = validate();
      error.textContent = problem ?? '';
      if (problem) return;
      const pw = password.input.value.trim();
      const adminPassword = admin.input.value.trim();
      try {
        const { doc, adminHash } = await busy(submit, () =>
          createBoard(textdb, name.input.value, pw, adminPassword, {
            tables,
            questions,
            size: Number(size.input.value),
          }),
        );
        local.upsertBoard({ name: doc.name, password: pw, config: doc.config, adminHash, adminPassword });
        toast(t('boardCreated'));
        boardScreen(doc.name, true);
      } catch (err) {
        error.textContent = errorText(err);
      }
    }

    root.append(
      topbar(t('createBoard'), back),
      h(
        'form',
        { class: 'card form', onsubmit: onSubmit },
        name.label,
        password.label,
        h('p', { class: 'hint' }, t('joinPasswordHint')),
        admin.label,
        h('p', { class: 'hint' }, t('adminPasswordHint')),
        h('h3', {}, t('boardTables')),
        tablePicker(TABLES, tables, (p) => (tables = p)),
        h('h3', {}, t('numQuestions')),
        segmented(QUESTION_COUNTS, questions, (v) => (questions = v), t('numQuestions')),
        size.label,
        error,
        submit,
      ),
    );
    name.input.focus();
  });
}

export function joinScreen(invite?: { name: string; password: string }, back: () => void = homeScreen): void {
  show((root) => {
    const name = field(t('boardName'), { maxLength: NAME_MAX, required: true, value: invite?.name ?? '' });
    const password = field(t('password'), { required: true, value: invite?.password ?? '' });
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, t('join'));

    async function onSubmit(e: Event) {
      e.preventDefault();
      error.textContent = '';
      const n = name.input.value.trim();
      const pw = password.input.value.trim();
      if (!n || !pw) return void (error.textContent = t('required'));
      try {
        const doc = await busy(submit, () => loadBoard(textdb, n, pw));
        local.upsertBoard({ name: doc.name, password: pw, config: doc.config });
        toast(t('joined', { name: doc.name }));
        boardScreen(doc.name);
      } catch (err) {
        error.textContent = errorText(err);
      }
    }

    root.append(
      topbar(t('joinBoard'), back),
      h(
        'form',
        { class: 'card form', onsubmit: onSubmit },
        invite ? h('p', { class: 'invite-msg' }, t('invitedTo', { name: invite.name })) : h('p', { class: 'hint' }, t('joinHelp')),
        name.label,
        password.label,
        error,
        submit,
      ),
    );
    (invite ? submit : name.input).focus();
  });
}
