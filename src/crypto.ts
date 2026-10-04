// The public store has no access control, so secrecy comes from the keys:
// a board is stored under an id derived from (name, join password) and its
// contents are encrypted with a key derived from the same pair. Without the
// password a board can neither be found nor read.

const ITERATIONS = 100_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function normalizeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

async function pbkdf2(secret: string, salt: string, bits: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const out = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITERATIONS },
    base,
    bits,
  );
  return new Uint8Array(out);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export interface BoardKeys {
  id: string;
  key: CryptoKey;
}

export async function boardKeys(name: string, password: string): Promise<BoardKeys> {
  const bits = await pbkdf2(password, `mulgame/v1/board/${normalizeName(name)}`, 512);
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { id: `mulgame-${hex(bits.slice(32))}`, key };
}

export async function hashAdmin(name: string, adminPassword: string): Promise<string> {
  return hex(await pbkdf2(adminPassword, `mulgame/v1/admin/${normalizeName(name)}`, 256));
}

/** Public marker that a board name is in use, so names stay unique. */
export async function claimId(name: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`mulgame/v1/name/${normalizeName(name)}`));
  return `mulgame-name-${hex(new Uint8Array(digest))}`;
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64(out);
}

export async function decryptJson<T>(key: CryptoKey, text: string): Promise<T> {
  const bytes = fromBase64(text);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return JSON.parse(dec.decode(plain)) as T;
}
