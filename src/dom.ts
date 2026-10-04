import { t } from './i18n';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const root = () => document.getElementById('app')!;
let cleanup: (() => void) | void;

/** Replaces the current screen. The render function may return a cleanup callback. */
export function show(render: (root: HTMLElement) => (() => void) | void): void {
  cleanup?.();
  cleanup = undefined;
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  root().replaceChildren();
  window.scrollTo(0, 0);
  cleanup = render(root());
}

export function topbar(title: string, onBack: () => void, ...extra: Child[]): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': t('back'), onclick: onBack }, '‹'),
    h('h1', {}, title),
    ...extra,
  );
}

/** Runs an async action with the button disabled and a spinner label. */
export async function busy<T>(button: HTMLButtonElement, action: () => Promise<T>): Promise<T> {
  const label = button.textContent;
  button.disabled = true;
  button.classList.add('busy');
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.classList.remove('busy');
    button.textContent = label;
  }
}

export function modal<T>(build: (close: (v: T) => void) => Child[], dismissValue: T): Promise<T> {
  return new Promise((resolve) => {
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
    const overlay = h('div', { class: 'overlay' }, box);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(dismissValue);
    };
    const close = (v: T) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    for (const c of build(close)) if (c) box.append(c instanceof Node ? c : String(c));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(dismissValue);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    (box.querySelector('input, .btn.primary, .btn') as HTMLElement | null)?.focus();
  });
}

export function confirmDialog(message: string, okLabel: string, danger = false): Promise<boolean> {
  return modal<boolean>(
    (close) => [
      h('p', { class: 'modal-msg' }, message),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => close(false) }, t('cancel')),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => close(true) }, okLabel),
      ),
    ],
    false,
  );
}

export interface PromptOptions {
  title: string;
  message?: string;
  label: string;
  value?: string;
  type?: 'text' | 'password';
  maxLength?: number;
  okLabel?: string;
  validate?: (v: string) => string | null | Promise<string | null>;
}

export function promptDialog(o: PromptOptions): Promise<string | null> {
  return modal<string | null>((close) => {
    const input = field(o.label, { type: o.type ?? 'text', value: o.value ?? '', maxLength: o.maxLength ?? 100 });
    const error = h('p', { class: 'error', role: 'alert' });
    const ok = h('button', { class: 'btn primary', type: 'submit' }, o.okLabel ?? t('ok'));
    const form = h(
      'form',
      {
        onsubmit: async (e: Event) => {
          e.preventDefault();
          const v = input.input.value.trim();
          const msg = o.validate ? await busy(ok, async () => o.validate!(v)) : v ? null : t('required');
          if (msg) error.textContent = msg;
          else close(v);
        },
      },
      input.label,
      error,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, t('cancel')), ok),
    );
    return [h('h2', {}, o.title), o.message ? h('p', { class: 'modal-msg' }, o.message) : null, form];
  }, null);
}

export function field(label: string, props: Props): { label: HTMLLabelElement; input: HTMLInputElement } {
  const input = h('input', { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...props });
  return { label: h('label', { class: 'field' }, h('span', {}, label), input), input };
}

export function toast(message: string): void {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

/** Toggle chips for picking multiplication tables. */
export function tablePicker(all: number[], initial: number[], onChange: (picked: number[]) => void): HTMLElement {
  const picked = new Set(initial);
  const emit = () => {
    chips.forEach((c, i) => c.setAttribute('aria-pressed', String(picked.has(all[i]))));
    toggleAll.textContent = picked.size === all.length ? t('selectNone') : t('selectAll');
    onChange(all.filter((n) => picked.has(n)));
  };
  const chips = all.map((n) =>
    h('button', { type: 'button', class: 'chip', onclick: () => (picked.has(n) ? picked.delete(n) : picked.add(n), emit()) }, n),
  );
  const toggleAll = h('button', {
    type: 'button',
    class: 'link',
    onclick: () => {
      const fill = picked.size !== all.length;
      picked.clear();
      if (fill) all.forEach((n) => picked.add(n));
      emit();
    },
  });
  const el = h('div', { class: 'picker' }, h('div', { class: 'chips' }, ...chips), toggleAll);
  queueMicrotask(emit);
  return el;
}

export function segmented(options: number[], initial: number, onChange: (v: number) => void, label: string): HTMLElement {
  let value = initial;
  const buttons = options.map((o) =>
    h('button', { type: 'button', class: 'seg', onclick: () => ((value = o), sync(), onChange(o)) }, o),
  );
  const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i] === value)));
  sync();
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label }, ...buttons);
}
