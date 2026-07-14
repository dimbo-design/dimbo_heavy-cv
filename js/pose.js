// PoseEngine — MediaPipe Pose Landmarker (lite) on the main thread.
// Third independent stream: the skeleton owns PRESENCE and the HEAD.
// The depth net keeps owning the visual mirror; hands keep owning gestures.
// If this engine fails, main falls back to the old depth heuristics.
// Emits: 'ready', 'pose' {vis, head, shoulders}, 'fatal'

// Local-primary with CDN fallback for the whole chain (bundle + wasm + model).
// MediaPipe has no built-in remote fallback, so we try our own origin first and
// fall back to the CDN / Google storage if a local file is missing.
const LOCAL = {
  bundle: new URL('../assets/vendor/mediapipe/vision_bundle.mjs', import.meta.url).href,
  wasm: new URL('../assets/vendor/mediapipe/wasm', import.meta.url).href,
  model: new URL('../assets/vendor/mediapipe-models/pose_landmarker_lite.task', import.meta.url).href,
};
const REMOTE = {
  bundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

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
    const build = async (src) => {
      const { FilesetResolver, PoseLandmarker } = await import(src.bundle);
      const files = await FilesetResolver.forVisionTasks(src.wasm);
      const make = (delegate) => PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: src.model, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
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
