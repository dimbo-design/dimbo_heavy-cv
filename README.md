# Dmitry Togulev — a living interface

A portfolio where the webcam is the primary input. The page exists as a
dormant particle field; when the camera notices a person, the field
assembles into their volumetric reflection, and the content reveals itself
around the silhouette. Hands are as visible to the interface as the face:
navigation is built on gestures.

## Authorship

Design, product decisions and field testing — **Dmitry Togulev**.
Code, architecture and interaction iterations — **Claude Code (Fable 5,
Anthropic)** in pair work with the author: the entire gesture vocabulary
was derived from real interaction logs, not invented up front.

## How it works

- [Depth Anything V2 Small](https://huggingface.co/onnx-community/depth-anything-v2-small)
  (ONNX) computes a depth map from webcam frames — in the browser, via
  **Transformers.js** (WebGPU with a WASM fallback). Nothing leaves the device.
- **MediaPipe Hand Landmarker** (main thread, GPU) tracks the hands — the
  gesture layer is built on it: the ring cursor, pinch and fist grabs, the tap.
- **MediaPipe Pose Landmarker** (lite) tracks the body skeleton: presence and
  the head position come from it — precise entry/exit and a focus that a
  raised palm cannot shake. When unavailable, it falls back to depth-map
  heuristics.
- **Three.js**: ~23,000 particles, a single shader covers every state —
  the model download materialises the field (accretion), presence gathers it
  into a form, an open chapter steps the form aside.
- Depth lives in a **Web Worker**; hands run on the main thread (MediaPipe's
  canonical path, ~5 ms/frame). The telemetry honestly reports the hand state.
- Presence, proximity and head position are heuristics straight from the
  depth map (foreground fraction, blob compactness, centroid, motion) — no
  third model.

## The gesture vocabulary

Built only on what a single RGB camera measures reliably (field logs killed
the towards/away axis by hand size — it jitters ±35%). The pointer on the
main screen is the reflection itself; grabbing is the act of closing fingers.

| gesture ↓ · screen → | the fork | a case chapter | photo fullscreen |
| --- | --- | --- | --- |
| hand near an item | highlight, a line fills → open | pdf: the ring → download | — |
| quick pinch (“quack”) | open the node | photo → fullscreen | flip |
| pinch + drag (free) | — | ↕ scrolls the text, ⟷ drives the strip under the hand — both at once | ⟷ flip · ↓ toss = close · zoomed: pan |
| open-palm fling ⟷ | — | nudge the strip | flip |
| **lazy finger: snap down** (palm parked) | — | **a step back — the finger pulls the sheet down** | — |
| finger moving up | — | not a gesture: the hand coming home | — |
| **lazy finger: sideways sweep** | — | **the strip flies with the finger** — no pinch needed | flip |
| palm swipe up | — | the sheet rides up — read on | — |
| palm swipe down | — | nothing: the palm owns one direction, “down” belongs to the finger | close the photo |
| **hover-hold on “close”** | — | **the chapter closes** — the same language as opening | — |
| **clench the palm into a fist** | — | **take the nearest photo — fullscreen** | the fist is a clutch |
| **the fist carries ⟷** | — | — | **the stack flips under the fist** (the same motion that opened it) |
| **the fist carries while zoomed** | — | — | **drags the frame around** |
| **open the fist into a palm** | — | — | **zoomed: reset the zoom; otherwise let the photo go — close** (a slow relax is not an act: nothing closes) |
| **two hands: apart / together** | — | — | **zoom in / out** (opening the palm resets) |
| gallery edge | — | the strip springs | the frame springs (“nothing further”) |
| leave the frame | sleep | close everything | close everything |

Integrity rules: swipes only flip and scroll — closing lives on the explicit
“close” target (dwell, same as opening nodes): the gesture-interface industry
(Kinect → Vision Pro) arrived exactly here, because a swing's recoil reads as
the opposite swipe. Scrolling is free — no axis lock; a fling demands a
strictly open palm, and for 0.65 s after releasing a grab all flings are
muted — the hand's inertia after a scroll must not read as anything. The
fist works only as a transition (the act of clenching/opening against a slow
baseline) — a relaxed hand crosses no thresholds. Fist acts demand a slow
hand and two frames of confirmation: fast motion smears the tracking and
“collapses” the fingers — such frames do not count. A gesture without a
clutch cannot be bidirectional: in the air there is no glass to lift the
finger from, and a return/wind-up is geometrically indistinguishable from
the opposite stroke. So the vertical axis is split across two families under
one sheet metaphor (the owner's design): the palm pushes the sheet up — you
read on; the finger, with the palm parked, pulls the sheet down — a step
back; each family is blind to the other's wind-ups and returns. Galleries,
where one gesture needs both directions, hold a “reading direction”:
opposite strokes count as returns; to turn around, stroke decisively harder
or pause ~2.5 s.

Quiet fallbacks: click, wheel, mouse drag, `Esc`. `⌥D` (or `?debug` in the
URL) — telemetry and the full-session gesture journal, cycling: full →
minimal → hidden; the “copy log” button (or `⌥C`) puts the journal on the
clipboard and deliberately outlives the hidden panel; “rec” (`⌥R`) records a
raw hand trace (15 Hz) that attaches to the copied journal. `?fresh` — the
site forgets you have been here (first-touch testing). Texts and photos are
edited per [CONTENT.md](CONTENT.md); gesture thresholds live in `js/config.js`.

## Running locally

There is no build. Any static server will do (modules and workers don't run
from `file://`):

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

The first run downloads the models (~45 MB total); after that — browser cache.

## Deploying to GitHub Pages

Repository: `dimbo-design/dimbo_heavy-cv`. After a push:
Settings → Pages → Source: `main` / root. `.nojekyll` is in place; the
camera requires HTTPS — GitHub Pages qualifies.

## Performance

The inference cadence is adaptive (`js/config.js → cadence`): depth at
20 fps with a person present (the model input is shrunk to 280×210 — a third
faster), 11 fps while reading a chapter, 6 fps with nobody in frame; hands at
30 fps only while present. Pixel ratio is capped at 1.5; empty states render
at half rate. The shader's depth-map crossfade makes the low cadence
invisible.

## Support

Desktop Chromium browsers (Chrome / Edge / Arc / Opera, WebGPU) are the
primary path; Safari and Firefox run via WASM (depth thinks slower, the
“mind” more pensive, the interface fully alive). Mobile devices get a
designed dead-end with the contacts.

A browser without WebGPU (today's Safari, older hardware) gets a quiet mouse
mode: the mirror sleeps, but the portfolio is fully open — nodes click,
chapters read, photos flip. A neutral explanation sits at the centre with a
“wake the mirror here” button for the stubborn. Models are not downloaded
without that click.

If a person is in frame but never raises a hand, the reflection gestures
first: a ghost hand of particles reaches towards the nearest node and
dissolves (repeating as a quiet ambient until hands appear). Hints live
inside the objects: until a chapter has ever been opened by hand, the
focused node's sub-label says “hold your hand — it opens”, and disappears
forever after the first success. No overlays, no tooltips.

Machine-verified: Chrome and Opera — the full gesture run; WebKit (Safari's
engine) — boot, the sleeping-screen gate, waking through the ghost option,
WASM inference, the mobile dead-end — with zero console errors.

## Structure

```
index.html          markup of all states
css/main.css        all styling (Fixel Display + IBM Plex Mono)
js/config.js        every tunable and perception threshold
js/content.js       RU/EN content, node anchors, chapter rendering
js/main.js          the state machine, signals, gestures → meaning, DOM choreography
js/scene.js         the particle field (Three.js, one shader, form poses)
js/depth.js         camera + frame pumping into the depth worker
js/depth-worker.js  Depth Anything V2 + presence statistics
js/hands.js         MediaPipe Hand Landmarker → compact hand geometry
js/gestures.js      cursor, grab/tap/flick/fling from the geometry
assets/fonts/       Fixel Display (otf)
assets/gallery/     case and board-game photography
assets/             favicon, og image, résumé (pdf)
```
