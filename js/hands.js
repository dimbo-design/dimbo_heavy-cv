// HandsEngine — MediaPipe Hand Landmarker on the main thread.
// The worker route proved fragile across machines; main-thread VIDEO mode
// is the canonical MediaPipe path (~5 ms/frame on GPU) and fails loudly.
// Emits: 'ready', 'hands' {hands, t}, 'fatal'

// Local-primary with CDN fallback for the whole chain (bundle + wasm + model).
// MediaPipe has no built-in remote fallback, so we try our own origin first and
// fall back to the CDN / Google storage if a local file is missing.
const LOCAL = {
  bundle: new URL('../assets/vendor/mediapipe/vision_bundle.mjs', import.meta.url).href,
  wasm: new URL('../assets/vendor/mediapipe/wasm', import.meta.url).href,
  model: new URL('../assets/vendor/mediapipe-models/hand_landmarker.task', import.meta.url).href,
};
const REMOTE = {
  bundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};

export class HandsEngine extends EventTarget {
  constructor() {
    super();
    this.video = null;
    this.lm = null;
    this.ready = false;
    this.failed = false;
    this.running = false;
    this.intervalMs = 33;
    this._timer = null;
    this._lastTs = 0;
    this._errors = 0;
  }

  async init(video) {
    this.video = video;
    // full-res video is wasted on landmarks and stalls the main thread —
    // a downscaled feed keeps the mirror fluid
    this._canvas = document.createElement('canvas');
    this._canvas.width = 384; this._canvas.height = 288;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: false });
    const build = async (src) => {
      const { FilesetResolver, HandLandmarker } = await import(src.bundle);
      const files = await FilesetResolver.forVisionTasks(src.wasm);
      const make = (delegate) => HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: src.model, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
      try { return await make('GPU'); }
      catch (_) { return await make('CPU'); }
    };
    try {
      try { this.lm = await build(LOCAL); }
      catch (_) { this.lm = await build(REMOTE); }
      this.ready = true;
      this._emit('ready', {});
      this._schedule(0);
    } catch (err) {
      this.failed = true;
      this._emit('fatal', { error: String(err) });
    }
  }

  start() { this.running = true; this._schedule(0); }
  stop() { this.running = false; }
  setCadence(ms) { this.intervalMs = ms; }

  _schedule(ms) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._tick(), ms);
  }

  _tick() {
    if (!this.ready || this.failed) return;
    if (!this.running || document.hidden || !this.video || this.video.readyState < 2) {
      this._schedule(200);
      return;
    }
    const t = performance.now();
    try {
      const ts = Math.max(this._lastTs + 1, t);
      this._lastTs = ts;
      this._ctx.drawImage(this.video, 0, 0, 384, 288);
      const res = this.lm.detectForVideo(this._canvas, ts);
      const hands = (res?.landmarks || []).map(summarize);
      this._errors = 0;
      this._emit('hands', { hands, t });
    } catch (_) {
      if (++this._errors > 30) {
        this.failed = true;
        this._emit('fatal', { error: 'detect loop failing' });
        return;
      }
    }
    this._schedule(this.intervalMs);
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

// Compact geometry: palm centre, hand size, pinch distance, openness, pointing.
// Coordinates normalized to the frame, x NOT yet mirrored.
function summarize(lm) {
  // 3D distances: a hand turned sideways foreshortens in 2D and fakes
  // pinches — the z MediaPipe gives is enough to make grab/release honest
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  const palm = avg(lm, [0, 5, 9, 13, 17]);
  const size = d(lm[0], lm[9]) + 1e-6;
  const pinch = d(lm[4], lm[8]) / size;
  const tips = [8, 12, 16, 20];
  const open = tips.reduce((s, i) => s + d(lm[i], palm), 0) / 4 / size;
  const idxExt = d(lm[8], palm) / size;
  const midExt = d(lm[12], palm) / size;
  const ringExt = d(lm[16], palm) / size;
  const pinkyExt = d(lm[20], palm) / size;
  // named signs (the mirror answers in the visitor's own language) — STRICT
  // profiles: a false positive here would insult an innocent guest
  const vSplit = d(lm[8], lm[12]) / size;
  let sign = null;
  // peace sits one jitter away from an honest pointing hand (index out,
  // middle flickering) — field log: PEACE fired during plain navigation.
  // So the V demands BOTH fingers clearly out, the rest clearly folded,
  // and a real split between the two. The like is a fist with the thumb
  // honestly out AND above the palm — a resting fist never lifts it there.
  const thumbExt = d(lm[4], palm) / size;
  if (midExt > 1.25 && idxExt < 0.95 && ringExt < 0.95 && pinkyExt < 0.95) sign = 'fack';
  else if (idxExt > 1.2 && midExt > 1.2 && ringExt < 0.9 && pinkyExt < 0.9 && vSplit > 0.3) sign = 'peace';
  else if (thumbExt > 0.85 && idxExt < 0.9 && midExt < 0.9 && ringExt < 0.9 &&
           pinkyExt < 0.9 && (palm.y - lm[4].y) / size > 0.45) sign = 'like';
  return {
    palm: { x: palm.x, y: palm.y },
    index: { x: lm[8].x, y: lm[8].y },
    thumb: { x: lm[4].x, y: lm[4].y },   // the two-hand heart reads on it
    wrist: { x: lm[0].x, y: lm[0].y },   // the anchor candidate: the one
                                         // point finger motion can't drag
    pinchPoint: { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 },
    size, pinch, open, sign,
    pointing: idxExt > 1.15 && midExt < 1.0,
    raw: lm,   // full skeleton, a reference not a copy: the ghost recorder
               // (⌥G) serializes it; nothing else may depend on it
  };
}

function avg(lm, idx) {
  let x = 0, y = 0, z = 0;
  for (const i of idx) { x += lm[i].x; y += lm[i].y; z += lm[i].z || 0; }
  return { x: x / idx.length, y: y / idx.length, z: z / idx.length };
}
