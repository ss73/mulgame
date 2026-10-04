# Times Tables / Gångertabeller

A playful, mobile-first web game for practising multiplication, with shared leaderboards.
A rewrite of [ss73/multgame](https://github.com/ss73/multgame), no longer using p5.

## Playing

- Pick tables (2–9) and the number of questions, then answer with the on-screen keypad (or a keyboard).
- Each question starts at 1000 points and loses 60 points per second down to a floor of 100.
- An answer is submitted automatically once it has as many digits as the right answer.
- The language follows the browser (Swedish or English) and can be changed in Settings.

## Leaderboards

- Anyone can create a leaderboard with a **name**, a **player password** and an **admin password**.
  The creator chooses the tables and the number of questions that count, and how many places
  the board has (default 10).
- Others join by entering the name and player password, or by scanning the QR code on the
  board's page. The QR code contains a link with the password, so treat it like the password.
- When a finished game qualifies for a board you've joined (same tables and number of
  questions), you're asked for a nickname once. It's kept in `localStorage` and can be changed
  in Settings. Each nickname appears at most once per board, with its best score.
- The owner can clear or delete the board from Settings. On another device, choose "I'm the
  owner" and enter the admin password.
- The admin password can be shown again in Settings on devices where the board was created or
  unlocked with "I'm the owner". It is kept only in that browser's `localStorage` and never sent
  to the store, which holds just a one-way hash, so it can't be recovered from anywhere else.

## Storage

Boards live on [textdb.dev](https://textdb.dev), a free public key-value store with no sign-up.
It has no access control, so:

- each board is stored under a key derived (PBKDF2) from *name + player password*, and its
  contents are encrypted (AES-GCM) with a key derived from the same pair. Without the password
  a board can't be found or read;
- a separate public key derived from the name alone marks the name as taken;
- the admin password is checked in the app, against a hash stored inside the encrypted board.
  Anyone who knows the *player* password and is willing to write their own code could still
  modify the board. That is accepted for a classroom game.

Limitations of relying on textdb.dev:

- it's a free hobby service run by one person, with no uptime guarantee. If it shuts down or
  loses data, all leaderboards are lost (nicknames and personal bests stay on each device);
- it has no delete. A deleted board is overwritten with an encrypted "deleted" marker;
- two writes to the same board at the same moment can overwrite each other. Score submission
  reads, merges, writes, then re-reads to check and retries, which is enough for a classroom.

All network access goes through `src/kv.ts`, so changing provider means replacing that file.

## Development

```sh
npm install
npm run dev       # http://localhost:5173/mulgame/
npm run dev:lan   # HTTPS on your LAN, for testing on a phone (WebCrypto needs a secure context)
npm test
npm run build
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
In the repository settings, set Pages → Source to "GitHub Actions".
