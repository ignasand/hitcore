# HitCore

IPSC hit-factor calculator, microphone shot timer and training logger. It's a plain-JS PWA with no build step, and it runs on iPhone (Safari / Home Screen) and on laptops.

## Features

- **Score**: Alpha / Charlie / Delta / Miss / No-shoot / Procedural counters, Minor/Major power factor, time, and live points, penalties, score and **hit factor** (Comstock).
- **Timer**: listens through the microphone and records the beep, every shot, splits and total time. Timing is sample-accurate.
  - **Learn coach beep**: press *Learn*, then trigger the coach's timer. The app stores the beep's frequency and length, and *Arm* starts the clock on that beep only. Learning again averages the result. A different timer (frequency more than 150 Hz away) replaces the stored one.
  - With no beep learned, it accepts any steady tone between 1.5 and 4.5 kHz.
  - *Own beep*: the phone plays a beep after a random delay that you set.
  - Optional: start the clock on the first shot.
  - Sensitivity slider, with the threshold marked on the level meter. Tap a split to remove a false shot (echo or the next bay).
  - *Use time → Score* copies the total time and splits into the calculator.
- **Log**: training sessions with participants. Each run saves shooter, exercise, hits, time, HF and splits. You can view it as a timeline, by shooter (average and best HF) or by exercise (ranking and % of top HF). Export CSV, and back up or import JSON. On iPhone this opens the share sheet.
- Works offline (service worker). Data stays on the device (localStorage).

## Run locally

```bash
python3 -m http.server 8080
```

Open http://localhost:8080. The microphone needs `localhost` or HTTPS.

## Use on iPhone

Host it on HTTPS, for example GitHub Pages (Settings → Pages → deploy from branch, root). Open it in Safari, then Share → *Add to Home Screen*. Allow microphone access when asked.

Tips: keep the phone 1–3 m from the shooter, learn the beep at the range, and turn the sensitivity down if shots from other bays are being counted.

## Tests

```bash
npm test
```

The detector is tested on synthetic audio (beep onset and shot times to within 3 ms, beep learning, first-shot start), along with the IPSC scoring.
