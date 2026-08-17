# WeHP — Workplace Health Point Dashboard

A full-stack implementation of the "Single-page HP Dashboard" Figma export:
a **React + Vite** frontend (the original UI, unchanged visually) backed by
a real **Express** API with in-memory persistence.

## What it does

- **Sign in** with just a name — creates a user with 10/10 HP, "working" status.
- **Your HP**: drop 1 HP and post an anonymous "tired" note to the team board.
- **Take Break / Resume Work** toggle.
- **Team board**: send an "energy potion" (positive message); teammates can
  claim it once for +1 HP each (not the sender, not twice, not above 10 HP).
- **Team stats**: live average HP of active users, working count, total users.
- Every client polls the server every 4s, so the dashboard reflects everyone
  else's actions (open it in two browser tabs to see it in action).

## Project layout

```
wehp/
├── client/          Vite + React + TypeScript frontend (original UI)
│   └── src/api.ts   Typed fetch client for the backend
└── server/          Express API + static file host
    ├── store.js     In-memory data model & business rules
    ├── routes/api.js REST endpoints
    └── index.js      App entry point (serves client/dist + /api/*)
```

## Running it

```bash
npm run install:all   # installs client + server deps
npm run build          # builds the React app into server/public
npm run server          # starts Express on http://localhost:3001
```

Or just `npm start`, which builds then serves.

For frontend development with hot reload (proxies /api to the Express
server, which you should run separately with `npm run dev:server`):

```bash
npm run dev:server     # terminal 1 — API on :3001
npm run dev:client     # terminal 2 — Vite dev server on :5173
```

## API

All endpoints are JSON, mounted under `/api`.

| Method | Path                      | Body                    | Description |
|--------|---------------------------|--------------------------|--------------|
| POST   | `/api/session`             | `{ name }`               | Sign in / create a user |
| GET    | `/api/dashboard?userId=`   | —                        | Full snapshot: `me`, `users`, `board`, `stats` |
| POST   | `/api/break/toggle`        | `{ userId }`              | Toggle working / on-break |
| POST   | `/api/drain`                | `{ userId, text }`        | Post a "tired" note, −1 HP |
| POST   | `/api/potion`               | `{ userId, text }`        | Post a positive message |
| POST   | `/api/potion/:id/claim`    | `{ userId }`              | Claim +1 HP from a potion |

Validation (can't claim your own potion, can't claim twice, can't drain
below 0 or claim above 10 HP, etc.) is enforced server-side in
`server/store.js`.

Data is in-memory only and resets when the server restarts.
