# HitCore

IPSC training logger with a microphone shot timer, hit-factor scoring and reports. It's a plain-JS PWA with no build step and runs on iPhone and laptops.

Live demo: https://ignasand.github.io/hitcore/ (sign-in required; ask the project owner for the demo account).

## Features

- **Sign-in.** A demo account protects the app, and each user gets their own data.
- **Training sessions.** Each session has a date, location, notes, participants and exercises.
- **Exercise library.** An exercise has a name, a round count (shots the counter waits for), required scoring hits and a setup description. Max stage points = 5 × required hits.
- **Shooter roster.** Division, default power factor, notes, and an active/inactive flag.
- **Live run.** Pick an exercise and press *Start* (or *Repeat*) for a shooter.
  1. The clock starts on the coach's beep (learned in Settings), or on the phone's own beep after a random delay.
  2. The microphone counts shots against the exercise's round count, e.g. `7 / 16`.
  3. When the count is reached, scoring opens automatically with the time already filled in. The app keeps listening for a few seconds, so make-up shots are still caught.
  4. Fill in A / C / D / M / NS / P. The app checks hits against required hits and offers to set the missing hits as misses.
  5. *Save & next shooter*, *Save & repeat*, or *Discard*.
- **Everything can be corrected.** Total time, each shot time (tap to edit), removing echoes, adding missed shots, hits, power factor and notes. Saved runs can be edited later, and every change is recorded with who changed it and when.
- **Reports.**
  - Session report: overall standings in IPSC stage points (best attempt per exercise), a ranking per exercise, accuracy, draw and split stats.
  - Shooter progress report: per-exercise trend and run history.
  - Print / PDF and CSV export.
- **Settings.** Mic sensitivity with a level meter, beep learning, first-shot start, own-beep delay, listening time after the last expected shot, JSON backup/import, and reset to demo data.

## Notes

- Sign-in is a client-side gate for the demo. A static site can't keep secrets, so a production rollout needs a backend with a real identity provider, plus shared storage if several coaches need the same data.
- Data stays on the device (localStorage). Use backup/import to move it between devices.

## Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. The microphone needs `localhost` or HTTPS.

## Tests

```bash
npm test
```

The tests cover the detector on synthetic audio, IPSC scoring and the report calculations.
