import { t, type Key } from '../i18n';
import { LbError, type BoardConfig } from '../leaderboard';

export function errorText(e: unknown): string {
  const code = e instanceof LbError ? e.code : 'network';
  return t(`err.${code}` as Key);
}

export function configSummary(c: Pick<BoardConfig, 'tables' | 'questions'>): string {
  return t('configSummary', { tables: c.tables.join(', '), questions: c.questions });
}

export function joinLink(name: string, password: string): string {
  const params = new URLSearchParams({ join: name, pw: password });
  return `${location.origin}${import.meta.env.BASE_URL}#${params}`;
}

/** Reads and strips an invite from the URL hash, so the password doesn't linger in the address bar. */
export function takeInviteFromUrl(): { name: string; password: string } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const name = params.get('join');
  const password = params.get('pw');
  if (!name || !password) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return { name, password };
}
