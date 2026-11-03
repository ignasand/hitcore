# HitCore

IPSC training logger with a microphone shot timer, live split grading, hit-factor scoring and reports. It runs on iPhone and laptops as an installable web app.

HitCore runs in two modes, using the same app code:

| | Public demo (GitHub Pages) | Production (HitCore server) |
|---|---|---|
| URL | https://ignasand.github.io/hitcore/ | your own host |
| Data | in memory, sample data, **reset on reload** | **SQLite database on the server** |
| Sign-in | fixed demo account | real user accounts, scrypt-hashed passwords, HttpOnly session cookie |
| Offline at the range | – | changes are queued on the device and synced automatically |

`config.js` selects the mode. The static file says `demo`, and the server serves `{ mode: 'api' }` at the same path.

## Production server

Requirements: Node.js 22.13 or newer. There are **no npm dependencies**; it uses the built-in `node:sqlite`, `node:http` and `node:crypto`.

```bash
HITCORE_ADMIN_USER=admin HITCORE_ADMIN_PASSWORD='choose-a-strong-one' npm start
```

Open http://localhost:8080 and sign in. The admin user is created only when the database has no users.

### Docker

```bash
docker build -t hitcore .
```

```bash
docker run -d --name hitcore -p 8080:8080 -v hitcore-data:/data -e HITCORE_ADMIN_USER=admin -e HITCORE_ADMIN_PASSWORD='choose-a-strong-one' hitcore
```

The database is stored at `/data/hitcore.db`, so keep `/data` on a persistent volume. Serve it over **HTTPS** behind a reverse proxy (Caddy, nginx, or a platform's TLS), because iPhones only allow microphone access on HTTPS. Behind a proxy, set `TRUST_PROXY=1`.

Hosting options include a small VPS, Fly.io (with a volume), Render (with a disk) or Railway. Any host with persistent storage works.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HITCORE_DB` | `./data/hitcore.db` | database file |
| `HITCORE_ADMIN_USER` / `HITCORE_ADMIN_PASSWORD` / `HITCORE_ADMIN_NAME` | – | create the first admin on an empty database |
| `HITCORE_SEED_DEMO` | – | `1` = load sample shooters, exercises and a session into an empty database |
| `TRUST_PROXY` | – | `1` = use `X-Forwarded-For` for login rate limiting |

### Administration

```bash
npm run manage -- add-user greta "Greta Mills"
```

```bash
npm run manage -- add-user boss "Club Admin" --admin
```

```bash
npm run manage -- passwd greta
```

```bash
npm run manage -- disable greta
```

```bash
npm run manage -- list-users
```

```bash
npm run manage -- audit 50
```

Admins can also add or disable users and read the audit log in the app, under Settings → Users.

**Backups.** The whole dataset is one SQLite file. Copy it with `sqlite3 hitcore.db ".backup backup.db"`, or snapshot the volume. Users can also export or import JSON backups from Settings.

## How results are saved

1. When a run is saved, it is applied in the app immediately and written to a durable **outbox** on the device (localStorage).
2. The outbox is sent to the server in order. Every request is **idempotent**, because records carry client-generated ids, so retries after a dropped connection never create duplicates.
3. If the device is offline or the server is unreachable, the app retries with backoff and shows the status ("Offline · 2 pending"). Nothing is lost when the app is closed; the queue resumes on the next start.
4. If the session expires, pending changes are kept and sent after the user signs in again.
5. The server validates every write. The database enforces foreign keys and check constraints, so shooters or exercises with recorded runs can't be deleted.
6. Each correction to a run is stored as a field-level **change history**. Every write is also recorded in an **audit log** with who made it and when.

When several coaches share the server, the app reloads data from the server whenever it returns to the foreground.

### Database schema

The tables are `users`, `auth_sessions`, `shooters`, `exercises`, `trainings`, `training_shooters`, `training_exercises`, `runs`, `run_history` and `audit_log`. The schema is in `server/db.js` and is versioned with `PRAGMA user_version`.

## Features

- Training sessions with participants and an exercise library. Each exercise has a round count (drives the shot counter) and required hits (drives scoring checks).
- **Live run.** The clock starts on the learned coach beep or the phone's own beep, and the mic counts shots up to the round count. Scoring then opens automatically with the time filled in, and the app keeps listening briefly for extra shots.
- **Split grading**: Fast / OK / Slow, plus Reload/move for long gaps. Each grade has its own icon and label, and there is a live split chart. Splits are graded against fixed targets or each shooter's own baseline.
- Every field can be corrected. Repeats count the best attempt.
- **Reports**: match-style session standings in IPSC stage points, shooter progress reports, CSV export and print/PDF.

## Development

```bash
npm test
```

The tests cover the detector, scoring, reports and grading, plus API integration tests: auth, persistence across restarts, integrity checks and admin.

```bash
npm run demo
```

This serves the static demo build at http://localhost:8080.
