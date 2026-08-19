# WeHP — Workplace Health Point Dashboard

A full-stack "Single-page HP Dashboard": a **React + Vite** frontend backed
by a real **Express** API with in-memory persistence, realtime push over
**WebSocket**, optional AI message translation, and an optional real smart
bulb that mirrors the team's average HP.

## What it does

- **Sign in** with a name + password — first sign-in creates the account
  (10/10 HP, "working" status); returning names must match their password.
- **Your HP**: drop 1 HP and post an anonymous "tired" note to the team board.
- **Take Break / Resume Work** toggle.
- **Team board**: send an "energy potion" (positive message, rate-limited by
  a cooldown) or a plain message; teammates can claim a potion once for +1 HP
  each (not the sender, not twice, not above 10 HP).
- **Team stats**: live average HP of active users, working count, total users.
- Board messages are optionally rewritten by Claude before broadcasting (see
  `ANTHROPIC_API_KEY` below) — falls back to the original text if unset.
- Every client holds a WebSocket connection for instant refresh signals, and
  also polls the server as a fallback, so the dashboard reflects everyone
  else's actions (open it in two browser tabs to see it in action).
- Optionally drives a real Tuya smart bulb to match the "Team Avg" HP color
  shown on screen (see `TUYA_*` below) — skipped entirely if unconfigured.
- The server can restart itself daily at a configured time (default midnight,
  `Asia/Bangkok`) with no external process manager required.

## Project layout

```
wehp/
├── client/              Vite + React + TypeScript frontend
│   └── src/
│       ├── api.ts       Typed fetch client + WebSocket URL helper
│       └── app/App.tsx  Main dashboard UI
└── server/              Express API + static file host
    ├── store.js         In-memory data model & business rules
    ├── ai.js            Optional Claude-based message translation
    ├── light.js          Optional Tuya smart bulb sync
    ├── ws.js             WebSocket push (refetch signal, not data)
    ├── restart.js         Scheduled daily self-restart
    ├── routes/api.js      REST endpoints
    ├── .env.example        All configurable environment variables
    └── index.js            App entry point (serves client/dist + /api/* + /ws)
```

## Running it

```bash
npm run install:all   # installs client + server deps
npm run build          # builds the React app into server/public
npm run server          # starts Express on http://localhost:3001
```

Or just `npm start`, which builds then serves.

For frontend development with hot reload (proxies /api and /ws to the
Express server, which you should run separately with `npm run dev:server`):

```bash
npm run dev:server     # terminal 1 — API on :3001
npm run dev:client     # terminal 2 — Vite dev server on :5173
```

Copy `server/.env.example` to `server/.env` to configure it — everything in
there is optional except `PORT`, which defaults sensibly if unset.

## Configuration

See `server/.env.example` for the full list. Highlights:

| Variable | Purpose |
|----------|---------|
| `POTION_COOLDOWN_SECONDS` | Minimum wait between potions sent by the same user (default 60) |
| `ANTHROPIC_API_KEY` / `AI_SYSTEM_PROMPT` | Rewrites board messages via Claude before broadcasting; unset = post as-is |
| `TUYA_BASE_URL` / `TUYA_ACCESS_KEY` / `TUYA_SECRET_KEY` / `TUYA_DEVICE_ID` | Syncs a real Tuya bulb to team-average HP; unset = no bulb control |
| `AUTO_RESTART_ENABLED` / `AUTO_RESTART_TIME` / `AUTO_RESTART_TIMEZONE` | Daily self-restart schedule (default `00:00` `Asia/Bangkok`) |

## API

All endpoints are JSON, mounted under `/api`. A WebSocket at `/ws` pushes a
`{ "type": "update" }` signal on every mutation so clients know to refetch.

| Method | Path                      | Body                    | Description |
|--------|---------------------------|--------------------------|--------------|
| GET    | `/api/account/exists?name=` | —                      | Check whether a name is already registered |
| POST   | `/api/session`             | `{ name, password }`     | Sign in (creates account on first use) |
| GET    | `/api/dashboard?userId=`   | —                        | Full snapshot: `me`, `users`, `board`, `stats` |
| POST   | `/api/break/toggle`        | `{ userId }`              | Toggle working / on-break |
| POST   | `/api/drain`                | `{ userId, text }`        | Post a "tired" note, −1 HP |
| POST   | `/api/potion`               | `{ userId, text }`        | Post a positive message (cooldown-limited) |
| POST   | `/api/message`               | `{ userId, text }`        | Post a plain message (no HP effect) |
| POST   | `/api/potion/:id/claim`    | `{ userId }`              | Claim +1 HP from a potion |

Validation (password required/matched, can't claim your own potion, can't
claim twice, can't drain below 0 or claim above 10 HP, potion cooldown, etc.)
is enforced server-side in `server/store.js`.

Data is in-memory only and resets when the server restarts (including the
scheduled daily auto-restart).
