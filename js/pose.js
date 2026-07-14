// PoseEngine — MediaPipe Pose Landmarker (lite) on the main thread.
// Third independent stream: the skeleton owns PRESENCE and the HEAD.
// The depth net keeps owning the visual mirror; hands keep owning gestures.
// If this engine fails, main falls back to the old depth heuristics.
// Emits: 'ready', 'pose' {vis, head, shoulders}, 'fatal'

// Step 1 — hard-local: bundle, wasm fileset and the .task model from our origin.
const CDN = new URL('../assets/vendor/mediapipe', import.meta.url).href;
const MODEL = new URL('../assets/vendor/mediapipe-models/pose_landmarker_lite.task', import.meta.url).href;

export class PoseEngine extends EventTarget {
  constructor() {
    super();
    this.video = null;
    this.lm = null;
    this.ready = false;
    this.failed = false;
    this.running = false;
    this.intervalMs = 150;
    this._timer = null;
    this._lastTs = 0;
    this._errors = 0;
  }

  async init(video) {
    this.video = video;
    this._canvas = document.createElement('canvas');
    this._canvas.width = 256; this._canvas.height = 192;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: false });
    try {
      const { FilesetResolver, PoseLandmarker } =
        await import(`${CDN}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const make = (delegate) => PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
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
      this._schedule(300);
      return;
    }
    try {
      const ts = Math.max(this._lastTs + 1, performance.now());
      this._lastTs = ts;
      this._ctx.drawImage(this.video, 0, 0, 256, 192);
      const res = this.lm.detectForVideo(this._canvas, ts);
      const lm = res?.landmarks?.[0];
      this._errors = 0;
      this._emit('pose', lm ? summarize(lm) : { vis: 0, head: null, shoulders: null });
    } catch (_) {
      if (++this._errors > 30) {
        this.failed = true;
        this._emit('fatal', { error: 'pose loop failing' });
        return;
      }
    }
    this._schedule(this.intervalMs);
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

// nose = 0 · left shoulder = 11 · right shoulder = 12
function summarize(lm) {
  const nose = lm[0], ls = lm[11], rs = lm[12];
  const v = (p) => p?.visibility ?? 0;
  return {
    vis: (v(nose) + v(ls) + v(rs)) / 3,
    head: { x: nose.x, y: nose.y },
    shoulders: {
      cx: (ls.x + rs.x) / 2,
      width: Math.hypot(ls.x - rs.x, ls.y - rs.y),
      tilt: Math.atan2(rs.y - ls.y, rs.x - ls.x),
    },
  };
}
