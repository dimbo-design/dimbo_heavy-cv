// Gesture interpretation over hand summaries.
// Semantics live in main.js; this layer turns raw hand geometry into a
// stable cursor + pinch / palm / point modes + swipe events.
//
// Vocabulary (discoverable by play, every action reversible):
//   point / open palm  → cursor, focus
//   dwell on a node    → charge → open   (handled in main via state here)
//   pinch + drag       → grab: move strips, scroll content, stir the field
//   fast lateral throw → swipe: close the open chapter
//   step back / Esc    → close

export class Gestures extends EventTarget {
  constructor() {
    super();
    this.active = false;          // a hand is visible
    this.mode = 'idle';           // idle | hand | point | palm | pinch | fist
    this.cursor = { x: 0, y: 0 }; // screen px, smoothed
    this.rawCursor = { x: 0, y: 0 };
    this.speed = 0;               // px/s, smoothed
    this.pinchStrength = 0;       // 0..1
    this.gain = 1.3;

    this._pinched = false;
    this._lastSeen = 0;
    this._lastT = 0;
    this._samples = [];           // {x,y,t} for velocity/swipe
    this._swipeCooldownUntil = 0;
    this._hasCursor = false;
  }

  // hands: from hands-worker; t: capture timestamp (perf.now ms)
  ingest({ hands, t }) {
    const now = performance.now();
    if (!hands.length) {
      if (this.active && now - this._lastSeen > 350) {
        this.active = false;
        this.mode = 'idle';
        this._pinched = false;
        this._hasCursor = false;
        this._samples.length = 0;
        this._emit('leave', {});
      }
      return;
    }
    this._lastSeen = now;

    // primary hand = the largest (closest) one
    const h = hands.reduce((a, b) => (b.size > a.size ? b : a));

    if (!this.active) {
      this.active = true;
      this._emit('enter', {});
    }

    // pinch hysteresis on the thumb–index distance
    const wasPinched = this._pinched;
    if (!this._pinched && h.pinch < 0.34) this._pinched = true;
    else if (this._pinched && h.pinch > 0.48) this._pinched = false;
    this.pinchStrength = clamp((0.55 - h.pinch) / 0.35, 0, 1);

    let mode;
    if (this._pinched) mode = 'pinch';
    else if (h.open < 0.82) mode = 'fist';
    else if (h.pointing) mode = 'point';
    else if (h.open > 1.22) mode = 'palm';
    else mode = 'hand';
    this.mode = mode;

    // cursor source: fingertip when pointing, pinch midpoint when pinching
    const src = mode === 'point' ? h.index : mode === 'pinch' ? h.pinchPoint : h.palm;
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = ((1 - src.x) - 0.5) * this.gain * vw + vw / 2;   // mirrored
    const y = (src.y - 0.5) * this.gain * vh + vh / 2;

    const dtms = this._lastT ? now - this._lastT : 33;
    this._lastT = now;

    if (!this._hasCursor) {
      this.cursor.x = x; this.cursor.y = y;
      this._hasCursor = true;
    }
    this.rawCursor.x = x; this.rawCursor.y = y;

    // adaptive smoothing: steadier when slow, snappier when fast
    const dist = Math.hypot(x - this.cursor.x, y - this.cursor.y);
    const inst = dist / (dtms / 1000);
    this.speed += (inst - this.speed) * 0.3;
    const a = clamp(0.12 + this.speed / 2600, 0.12, 0.55);
    const px = this.cursor.x, py = this.cursor.y;
    this.cursor.x += (x - this.cursor.x) * a;
    this.cursor.y += (y - this.cursor.y) * a;

    this._samples.push({ x: this.cursor.x, y: this.cursor.y, t: now });
    while (this._samples.length && now - this._samples[0].t > 300) this._samples.shift();

    // pinch drag lifecycle
    if (this._pinched && !wasPinched) {
      this._emit('pinchstart', { x: this.cursor.x, y: this.cursor.y });
    } else if (this._pinched && wasPinched) {
      this._emit('pinchmove', {
        x: this.cursor.x, y: this.cursor.y,
        dx: this.cursor.x - px, dy: this.cursor.y - py,
      });
    } else if (!this._pinched && wasPinched) {
      const v = this._velocity();
      this._emit('pinchend', v);
    }

    // swipe: open-hand fast lateral throw
    if (!this._pinched && (mode === 'palm' || mode === 'hand') &&
        now > this._swipeCooldownUntil && this._samples.length > 3) {
      const s0 = this._samples[0];
      const dx = this.cursor.x - s0.x;
      const dy = this.cursor.y - s0.y;
      const v = this._velocity();
      if (Math.abs(dx) > window.innerWidth * 0.17 &&
          Math.abs(dx) > Math.abs(dy) * 1.7 && Math.abs(v.vx) > 1500) {
        this._swipeCooldownUntil = now + 900;
        this._samples.length = 0;
        this._emit('swipe', { dir: dx > 0 ? 'right' : 'left', vx: v.vx });
      }
    }
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
