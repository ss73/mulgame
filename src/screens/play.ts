import { confirmDialog, h, show } from '../dom';
import { makeQuestions, pointsAt, POINTS_MIN, POINTS_START } from '../game';
import { t } from '../i18n';
import { homeScreen } from './home';
import { resultScreen } from './result';

export interface GameSetup {
  tables: number[];
  questions: number;
}

const PREP_SECONDS = 3;
const FEEDBACK_RIGHT_MS = 900;
const FEEDBACK_WRONG_MS = 2600;

export function playScreen(setup: GameSetup): void {
  show((root) => {
    const questions = makeQuestions(setup.tables, setup.questions);
    let index = 0;
    let input = '';
    let total = 0;
    let correct = 0;
    let startedAt = 0;
    let phase: 'prep' | 'ask' | 'feedback' | 'done' = 'prep';
    let frame = 0;
    let timer = 0;

    const progress = h('span', { class: 'progress' });
    const totalEl = h('span', { class: 'total' });
    const questionEl = h('div', { class: 'question' });
    const answerEl = h('div', { class: 'answer', 'aria-live': 'polite' });
    const meterFill = h('div', { class: 'meter-fill' });
    const meterNum = h('span', { class: 'meter-num' });
    const feedback = h('button', { class: 'feedback', hidden: true, onclick: () => next() });
    const countdown = h('div', { class: 'countdown' });
    const prep = h('div', { class: 'prep' }, h('p', {}, t('getReady')), countdown);

    const key = (label: string, onPress: () => void, cls = '', aria?: string) =>
      h('button', { class: `key ${cls}`, 'aria-label': aria, onclick: onPress }, label);
    const keypad = h(
      'div',
      { class: 'keypad' },
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => type(d))),
      key('⌫', backspace, 'key-alt', t('erase')),
      key('0', () => type('0')),
      key(t('ok'), submit, 'key-ok'),
    );

    root.append(
      h(
        'div',
        { class: 'play' },
        h(
          'header',
          { class: 'play-top' },
          h('button', { class: 'icon-btn', 'aria-label': t('quit'), onclick: quit }, '✕'),
          progress,
          totalEl,
        ),
        h('div', { class: 'stage' }, questionEl, answerEl, h('div', { class: 'meter' }, meterFill, meterNum), feedback, prep),
        keypad,
      ),
    );

    function render() {
      const [a, b] = questions[index];
      progress.textContent = t('questionOf', { n: index + 1, total: questions.length });
      totalEl.textContent = t('pointsShort', { points: total });
      questionEl.textContent = `${a} × ${b}`;
      answerEl.textContent = input || '?';
      answerEl.classList.toggle('empty', !input);
    }

    function tick() {
      const p = phase === 'ask' ? pointsAt(performance.now() - startedAt) : POINTS_START;
      meterNum.textContent = String(p);
      meterFill.style.width = `${((p - POINTS_MIN) / (POINTS_START - POINTS_MIN)) * 100}%`;
      if (phase === 'ask') frame = requestAnimationFrame(tick);
    }

    function startPrep(n: number) {
      countdown.textContent = String(n);
      countdown.classList.remove('pop');
      void countdown.offsetWidth; // restart the animation
      countdown.classList.add('pop');
      timer = window.setTimeout(() => (n > 1 ? startPrep(n - 1) : ask()), 1000);
    }

    function ask() {
      prep.hidden = true;
      feedback.hidden = true;
      input = '';
      phase = 'ask';
      startedAt = performance.now();
      render();
      tick();
    }

    function type(d: string) {
      if (phase !== 'ask' || input.length >= 3) return;
      input += d;
      render();
      const [a, b] = questions[index];
      if (input.length >= String(a * b).length) submit();
    }

    function backspace() {
      if (phase !== 'ask') return;
      input = input.slice(0, -1);
      render();
    }

    function submit() {
      if (phase !== 'ask' || !input) return;
      cancelAnimationFrame(frame);
      const [a, b] = questions[index];
      const right = Number(input) === a * b;
      const points = right ? pointsAt(performance.now() - startedAt) : 0;
      total += points;
      if (right) correct++;
      phase = 'feedback';
      render();
      feedback.className = `feedback ${right ? 'right' : 'wrong'}`;
      feedback.replaceChildren(
        ...(right
          ? [h('span', { class: 'big' }, '✓'), h('span', {}, `+${points}`)]
          : [h('span', { class: 'big' }, '✗'), h('s', { 'aria-label': t('youAnswered', { answer: input }) }, input), h('span', {}, `${a} × ${b} = ${a * b}`)]),
        h('small', {}, t('tapToContinue')),
      );
      feedback.hidden = false;
      timer = window.setTimeout(next, right ? FEEDBACK_RIGHT_MS : FEEDBACK_WRONG_MS);
    }

    function next() {
      if (phase !== 'feedback') return;
      clearTimeout(timer);
      index++;
      if (index < questions.length) ask();
      else {
        phase = 'done';
        resultScreen({ setup, total, correct, count: questions.length });
      }
    }

    async function quit() {
      const wasAsking = phase === 'ask';
      if (await confirmDialog(t('quitConfirm'), t('quit'), true)) homeScreen();
      else if (wasAsking && phase === 'ask') render();
    }

    function onKey(e: KeyboardEvent) {
      if (document.querySelector('.overlay')) return;
      if (/^[0-9]$/.test(e.key)) type(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter') phase === 'feedback' ? next() : submit();
      else if (e.key === 'Escape') void quit();
      else return;
      e.preventDefault();
    }

    document.addEventListener('keydown', onKey);
    render();
    answerEl.textContent = '';
    tick();
    startPrep(PREP_SECONDS);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
    };
  });
}
