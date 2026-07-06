// DepthEngine — owns the camera, the inference worker and the frame pump.
// Emits: 'progress' {p}, 'ready' {device}, 'depth' {data,width,height,stats},
//        'fatal' {error}

import { CONFIG } from './config.js';

export class DepthEngine extends EventTarget {
  constructor() {
    super();
    this.worker = null;
    this.video = null;
    this.stream = null;
    this.ready = false;
    this.device = null;
    this.inW = CONFIG.input.width;
    this.inH = CONFIG.input.height;
    this.inflight = false;
    this.lastSend = 0;
    this.running = false;
    this.inferMs = 0;         // EMA of inference interval
    this.intervalMs = CONFIG.pump.minIntervalMs;
    this._pumpTimer = null;
  }

  setCadence(ms) { this.intervalMs = ms; }

  initWorker() {
    this.worker = new Worker('js/depth-worker.js', { type: 'module' });
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => {
      this._emit('fatal', { error: e.message || 'worker error' });
    };
    this.worker.postMessage({
      type: 'init',
      gpuSize: CONFIG.input,
      cpuSize: CONFIG.inputCpu,
      threshold: CONFIG.presence.threshold,
    });
  }

  async startCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    const v = document.getElementById('cam');
    v.srcObject = this.stream;
    await v.play();
    this.video = v;
    this.running = true;
    this._pump();
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'progress': this._emit('progress', { p: msg.p }); break;
      case 'ready':
        this.ready = true;
        this.device = msg.device;
        this.inW = msg.width; this.inH = msg.height;
        this._emit('ready', { device: msg.device });
        this._pump();
        break;
      case 'depth': {
        const now = performance.now();
        const gap = now - this.lastSend;
        this.inferMs = this.inferMs ? this.inferMs * 0.8 + gap * 0.2 : gap;
        this.inflight = false;
        this._emit('depth', msg);
        this._pump();
        break;
      }
      case 'inferError':
        this.inflight = false;
        this._pump();
        break;
      case 'fatal':
        this._emit('fatal', { error: msg.error });
        break;
    }
  }

  _pump() {
    if (!this.running || !this.ready || this.inflight) return;
    if (document.hidden) {                       // don't burn cycles in a hidden tab
      clearTimeout(this._pumpTimer);
      this._pumpTimer = setTimeout(() => this._pump(), 500);
      return;
    }
    const since = performance.now() - this.lastSend;
    const wait = Math.max(0, this.intervalMs - since);
    clearTimeout(this._pumpTimer);
    this._pumpTimer = setTimeout(() => this._send(), wait);
  }

  async _send() {
    const v = this.video;
    if (!v || v.readyState < 2 || this.inflight || !this.ready) {
      this._pumpTimer = setTimeout(() => this._pump(), 120);
      return;
    }
    try {
      const bmp = await createImageBitmap(v, {
        resizeWidth: this.inW, resizeHeight: this.inH, resizeQuality: 'low',
      });
      this.inflight = true;
      this.lastSend = performance.now();
      this.worker.postMessage({ type: 'frame', bitmap: bmp }, [bmp]);
    } catch (_) {
      this._pumpTimer = setTimeout(() => this._pump(), 150);
    }
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
