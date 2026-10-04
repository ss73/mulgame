// Storage adapter. Everything that talks to the online store lives here, so
// switching provider means replacing this file only.

export interface KV {
  /** Returns null when the key has no value. */
  get(key: string): Promise<string | null>;
  /** Writing an empty string clears the key. */
  put(key: string, value: string): Promise<void>;
}

// textdb.dev: free, no sign-up, anyone who knows a key can read and write it.
// A missing key reads as an empty body.
const TEXTDB = 'https://textdb.dev/api/data/';

export const textdb: KV = {
  async get(key) {
    const res = await fetch(TEXTDB + encodeURIComponent(key), { cache: 'no-store' });
    if (!res.ok) throw new Error(`textdb GET ${res.status}`);
    const text = await res.text();
    return text === '' ? null : text;
  },
  async put(key, value) {
    const res = await fetch(TEXTDB + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: value,
    });
    if (!res.ok) throw new Error(`textdb POST ${res.status}`);
  },
};

export function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key) {
      return data.get(key) || null;
    },
    async put(key, value) {
      data.set(key, value);
    },
  };
}
