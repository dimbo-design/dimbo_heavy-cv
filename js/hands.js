// HandsEngine — MediaPipe Hand Landmarker on the main thread.
// The worker route proved fragile across machines; main-thread VIDEO mode
// is the canonical MediaPipe path (~5 ms/frame on GPU) and fails loudly.
// Emits: 'ready', 'hands' {hands, t}, 'fatal'

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

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
    try {
      const { FilesetResolver, HandLandmarker } =
        await import(`${CDN}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const make = (delegate) => HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
      try { this.lm = await make('GPU'); }
      catch (_) { this.lm = await make('CPU'); }
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
  return {
    palm: { x: palm.x, y: palm.y },
    index: { x: lm[8].x, y: lm[8].y },
    pinchPoint: { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 },
    size, pinch, open,
    pointing: idxExt > 1.15 && midExt < 1.0,
  };
}

function avg(lm, idx) {
  let x = 0, y = 0, z = 0;
  for (const i of idx) { x += lm[i].x; y += lm[i].y; z += lm[i].z || 0; }
  return { x: x / idx.length, y: y / idx.length, z: z / idx.length };
}
