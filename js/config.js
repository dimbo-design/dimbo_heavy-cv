// Central tuning. Everything that shapes the feel of the experience lives here.

export const CONFIG = {
  // Depth model input, multiples of 14 (ViT patch size).
  input:    { width: 336, height: 252 },  // webgpu
  inputCpu: { width: 224, height: 168 },  // wasm fallback

  // Particle field
  grid:  { cols: 200, rows: 150 },        // 30 000 points
  plane: { width: 10.4, height: 7.8 },
  depthAmp: 4.4,                          // z extrusion of the depth form
  pointPx: 30.0,                          // base point size factor

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

    leanDelta: 0.105,     // proximity rise over baseline that opens a panel
    leanMs:    450,
    closeDelta: 0.075,    // proximity drop that closes it
    closeMs:    750,
    reopenBlockMs: 1300,
  },

  focus: {
    gain: 2.6,            // head-x ↦ focus cursor amplification
    maxDistPx: 260,       // max distance between cursor and node to focus it
    smooth: 0.10,
  },

  reveal: {
    nameMs: 900,          // name appears after presence confirmed
    nodesMs: 3200,        // content nodes appear after dwell
    stagger: 90,
  },

  pump: { minIntervalMs: 30 },
};
