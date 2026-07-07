// Gesture interpretation over hand summaries.
//
// Design rule: a MINIMAL, conflict-free vocabulary. One motion — one meaning:
//   hand moves            → cursor + focus (nothing else reacts)
//   dwell still on target → charge ring → act        (open node / take pdf)
//   grab (pinch OR fist) + move → drag, axis-locked  (strip ⟷ · content ↕)
//   grab held still       → charge ring → close      (chapter / lightbox)
//   quick pinch (tap)     → silent click at the cursor
// Every action is reversible and previewed by the ring before it fires.

export class Gestures extends EventTarget {
  constructor() {
    super();
    this.active = false;
    this.mode = 'idle';           // idle | hand | point | palm | grab | fist
    this.cursor = { x: 0, y: 0 };
    this.speed = 0;
    this.pinchStrength = 0;
    this.grabbing = false;
    this.gain = 1.3;

    this._pinched = false;
    this._fisted = false;
    this._grabSource = null;      // 'pinch' | 'fist'
    this._grabStartAt = 0;
    this._grabStart = { x: 0, y: 0 };
    this._grabMoved = 0;
    this._grabLive = false;       // grabstart emitted (movement or time passed)

    this._lastSeen = 0;
    this._lastT = 0;
    this._samples = [];
    this._hasCursor = false;
  }

  // grab held without movement — the deliberate "close" charge in main
  grabStillMs(now) {
    return this.grabbing && !this._grabLive ? (now ?? performance.now()) - this._grabStartAt : 0;
  }

  ingest({ hands }) {
    const now = performance.now();
    if (!hands.length) {
      if (this.active && now - this._lastSeen > 350) this._dropHand();
      return;
    }
    this._lastSeen = now;

    const h = hands.reduce((a, b) => (b.size > a.size ? b : a));

    if (!this.active) {
      this.active = true;
      this._emit('enter', {});
    }

    // ---- grab state: pinch OR fist, with hysteresis
    const wasGrabbing = this.grabbing;
    if (!this._pinched && h.pinch < 0.34) this._pinched = true;
    else if (this._pinched && h.pinch > 0.48) this._pinched = false;
    if (!this._fisted && h.open < 0.80) this._fisted = true;
    else if (this._fisted && h.open > 1.02) this._fisted = false;
    this.pinchStrength = clamp((0.55 - h.pinch) / 0.35, 0, 1);
    this.grabbing = this._pinched || this._fisted;
    if (this.grabbing && !wasGrabbing) this._grabSource = this._pinched ? 'pinch' : 'fist';

    let mode;
    if (this.grabbing) mode = 'grab';
    else if (h.pointing) mode = 'point';
    else if (h.open > 1.22) mode = 'palm';
    else mode = 'hand';
    this.mode = mode;

    // ---- cursor
    const src = mode === 'point' ? h.index : this.grabbing && this._grabSource === 'pinch' ? h.pinchPoint : h.palm;
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = ((1 - src.x) - 0.5) * this.gain * vw + vw / 2;
    const y = (src.y - 0.5) * this.gain * vh + vh / 2;

    const dtms = this._lastT ? now - this._lastT : 33;
    this._lastT = now;

    if (!this._hasCursor) {
      this.cursor.x = x; this.cursor.y = y;
      this._hasCursor = true;
    }

    const dist = Math.hypot(x - this.cursor.x, y - this.cursor.y);
    const inst = dist / (dtms / 1000);
    this.speed += (inst - this.speed) * 0.35;
    // responsive smoothing; extra-stiff while grabbing so drags feel 1:1
    let a = clamp(0.16 + this.speed / 2200, 0.16, 0.7);
    if (this.grabbing) a = Math.max(a, 0.5);
    const px = this.cursor.x, py = this.cursor.y;
    this.cursor.x += (x - this.cursor.x) * a;
    this.cursor.y += (y - this.cursor.y) * a;

    this._samples.push({ x: this.cursor.x, y: this.cursor.y, t: now });
    while (this._samples.length && now - this._samples[0].t > 300) this._samples.shift();

    // ---- grab lifecycle with tap detection
    if (this.grabbing && !wasGrabbing) {
      this._grabStartAt = now;
      this._grabStart.x = this.cursor.x; this._grabStart.y = this.cursor.y;
      this._grabMoved = 0;
      this._grabLive = false;
    } else if (this.grabbing && wasGrabbing) {
      this._grabMoved += Math.hypot(this.cursor.x - px, this.cursor.y - py);
      if (!this._grabLive && this._grabMoved > 14) {
        this._grabLive = true;
        this._emit('grabstart', { x: this._grabStart.x, y: this._grabStart.y, source: this._grabSource });
      }
      if (this._grabLive) {
        this._emit('grabmove', {
          x: this.cursor.x, y: this.cursor.y,
          dx: this.cursor.x - px, dy: this.cursor.y - py,
        });
      }
    } else if (!this.grabbing && wasGrabbing) {
      if (this._grabLive) {
        this._emit('grabend', this._velocity());
      } else if (this._grabSource === 'pinch' &&
                 now - this._grabStartAt < 260 && this._grabMoved < 30) {
        this._emit('tap', { x: this.cursor.x, y: this.cursor.y });
      }
      this._grabLive = false;
    }

  }

  _dropHand() {
    if (this._grabLive) this._emit('grabend', { vx: 0, vy: 0 });
    this.active = false;
    this.mode = 'idle';
    this.grabbing = false;
    this._pinched = false;
    this._fisted = false;
    this._grabLive = false;
    this._hasCursor = false;
    this._samples.length = 0;
    this._emit('leave', {});
  }

  _velocity() {
    if (this._samples.length < 2) return { vx: 0, vy: 0 };
    const a = this._samples[0];
    const b = this._samples[this._samples.length - 1];
    const dt = Math.max(16, b.t - a.t) / 1000;
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
