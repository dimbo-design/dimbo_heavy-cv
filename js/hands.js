// HandsEngine — pumps camera frames into the hand-tracking worker.
// Emits: 'ready', 'hands' {hands, t}, 'fatal'

export class HandsEngine extends EventTarget {
  constructor() {
    super();
    this.worker = null;
    this.video = null;
    this.ready = false;
    this.running = false;
    this.inflight = false;
    this.intervalMs = 50;
    this._timer = null;
    this._lastSend = 0;
  }

  init(video) {
    this.video = video;
    this.worker = new Worker('js/hands-worker.js', { type: 'module' });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') {
        this.ready = true;
        this._emit('ready', {});
        this._pump();
      } else if (m.type === 'hands') {
        this.inflight = false;
        this._emit('hands', m);
        this._pump();
      } else if (m.type === 'fatal') {
        this._emit('fatal', { error: m.error });
      }
    };
    this.worker.onerror = () => this._emit('fatal', { error: 'hands worker error' });
    this.worker.postMessage({ type: 'init' });
  }

  start() { this.running = true; this._pump(); }
  stop() { this.running = false; clearTimeout(this._timer); }
  setCadence(ms) { this.intervalMs = ms; }

  _pump() {
    if (!this.running || !this.ready || this.inflight) return;
    if (document.hidden) {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this._pump(), 500);
      return;
    }
    const wait = Math.max(0, this.intervalMs - (performance.now() - this._lastSend));
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._send(), wait);
  }

  async _send() {
    const v = this.video;
    if (!v || v.readyState < 2 || this.inflight || !this.running) {
      this._timer = setTimeout(() => this._pump(), 150);
      return;
    }
    try {
      const bmp = await createImageBitmap(v, {
        resizeWidth: 320, resizeHeight: 240, resizeQuality: 'low',
      });
      this.inflight = true;
      this._lastSend = performance.now();
      this.worker.postMessage({ type: 'frame', bitmap: bmp, t: this._lastSend }, [bmp]);
    } catch (_) {
      this._timer = setTimeout(() => this._pump(), 150);
    }
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
