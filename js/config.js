// Central tuning. Everything that shapes the feel of the experience lives here.

export const CONFIG = {
  // Depth model input, multiples of 14 (ViT patch size).
  // 280×210 = 300 patches vs 432 at 336×252 — ~30% faster per frame,
  // indistinguishable through a 176×132 particle grid.
  input:    { width: 280, height: 210 },  // webgpu
  inputCpu: { width: 224, height: 168 },  // wasm fallback

  // Particle field
  grid:  { cols: 176, rows: 132 },        // 23 232 points
  plane: { width: 10.4, height: 7.8 },
  depthAmp: 4.4,                          // z extrusion of the depth form
  pointPx: 4.1,                           // base point size (css px before depth factor)
  micro: 0,                               // formed-body micro-life (0 = statuesque)

  camera: { fov: 40, z: 13.5 },

  colors: {
    bg:     0x0a0a0d,
    base:   0xe7e2d5,   // bone white
    accent: 0xd9a35d,   // muted amber, closest depth band only
  },

  // Field coherence per state (0 = free drift, 1 = full depth form)
  coherence: {
    dormant:  0.0,
    watching: 0.16,   // faint ghost of the room
    present:  1.0,
  },

  // Presence heuristics (computed on normalized uint8 depth map)
  presence: {
    threshold: 168,       // depth value counted as "near"
    enterScore: 0.32,     // blob score to start counting as a person
    exitScore:  0.12,
    enterMs:    450,
    exitMs:     3000,
    motionGate: 0.010,    // recent motion required to *enter* presence
    spreadLo:   0.12,     // blob spread ↦ compactness mapping
    spreadHi:   0.44,

    proxMin: 0.05,        // foreground fraction ↦ proximity 0..1
    proxMax: 0.42,

    // skeleton presence (Pose Landmarker); depth heuristics are the fallback
    poseEnter: 0.55, poseExit: 0.30,
    poseEnterMs: 400, poseExitMs: 2200,

    leanDelta: 0.105,     // proximity rise over baseline that opens a panel
    leanMs:    450,
    closeDelta: 0.075,    // proximity drop that closes it
    closeMs:    750,
    reopenBlockMs: 1300,
  },

  focus: {
    gain: 2.6,            // head-x ↦ focus cursor amplification
    maxDistPx: 190,       // max distance between cursor and node to focus it
                          // (260 grabbed neighbours: aiming under one lit another)
    smooth: 0.10,
  },

  reveal: {
    nameMs: 900,          // name appears after presence confirmed
    nodesMs: 2560,        // content nodes appear after dwell (3200 −20%: owner)
    stagger: 90,
  },

  // Inference cadence per state, ms between frames (heat control).
  // The uMix crossfade in the shader hides the low rate completely.
  cadence: {
    depthPresent: 50,      // the mirror must feel alive
    depthReading: 90,      // a chapter is open, person mostly still
    depthIdle: 160,        // camera on, nobody in frame
    handsPresent: 33,      // gestures need low latency above all
    handsIdle: 140,
    posePresent: 140,      // skeleton presence/head — smooth is enough
    poseIdle: 150,
  },

  hold: { ms: 900, maxSpeed: 420 },       // dwell charge: bar appears at 40%, fills over the rest

  pump: { minIntervalMs: 70 },
};

// ---- quality experiment knobs (URL params, defaults untouched) ----------
// ?grid=216   → 216×162 particles (4:3 kept, clamped 120..300). GPU-cheap:
//               one draw call either way; the inference cost is unaffected.
// ?micro=0.4  → a whisper of depth shimmer on the formed body (0..1).
// Judge with the fps line in ?debug telemetry before adopting as default.
try {
  const q = new URLSearchParams(location.search);
  const gp = parseInt(q.get('grid'), 10);
  if (gp >= 120 && gp <= 300) {
    CONFIG.grid = { cols: gp, rows: Math.round(gp * 0.75) };
  }
  const mp = parseFloat(q.get('micro'));
  if (mp >= 0 && mp <= 1) CONFIG.micro = mp;
} catch (_) { /* non-browser context (tests) */ }
