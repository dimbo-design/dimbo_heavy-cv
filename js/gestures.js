// Gesture interpretation over hand summaries.
//
// Design rule: redundancy over purity. We don't know the visitor's
// background, so every plausible attempt maps to the nearest intent:
//   grab   = pinch OR fist            (drag strips, scroll, stir the field)
//   tap    = quick pinch-release      (acts like a click at the cursor)
//   poke   = hand pushed at screen    (also a click — people jab at things)
//   dwell  = holding still on target  (charge ring → open; handled in main)
//   swipe  = fast open-hand throw     (horizontal: close/flip · vertical: scroll)
// Every action is reversible; feedback is immediate (cursor + field touch).

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

    this._sizeSlow = 0;           // slow EMA of hand size → poke baseline
    this._sizeFast = 0;
    this._pokeCooldownUntil = 0;

    this._lastSeen = 0;
    this._lastT = 0;
    this._samples = [];
    this._swipeCooldownUntil = 0;
    this._hasCursor = false;
    this._prof = { swipeVx: 1150, swipeVy: 950 };
  }

  // per-state thresholds: deeper into content, the lighter the flick
  setProfile(p) { this._prof = { ...this._prof, ...p }; }

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
      this._sizeSlow = h.size;
      this._sizeFast = h.size;
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

    // ---- poke: the hand jabs toward the screen (size grows fast)
    this._sizeFast += (h.size - this._sizeFast) * 0.4;
    this._sizeSlow += (h.size - this._sizeSlow) * 0.05;
    if (!this.grabbing && now > this._pokeCooldownUntil &&
        this._sizeFast > this._sizeSlow * 1.24 && this.speed < 600) {
      this._pokeCooldownUntil = now + 1000;
      this._sizeSlow = this._sizeFast;
      this._emit('poke', { x: this.cursor.x, y: this.cursor.y });
    }

    // ---- grab lifecycle with tap detection
    if (this.grabbing && !wasGrabbing) {
      this._grabStartAt = now;
      this._grabStart.x = this.cursor.x; this._grabStart.y = this.cursor.y;
      this._grabMoved = 0;
      this._grabLive = false;
    } else if (this.grabbing && wasGrabbing) {
      this._grabMoved += Math.hypot(this.cursor.x - px, this.cursor.y - py);
      if (!this._grabLive && (this._grabMoved > 14 || now - this._grabStartAt > 260)) {
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

    // ---- swipe: open-hand throw, both axes
    if (!this.grabbing && (mode === 'palm' || mode === 'hand') &&
        now > this._swipeCooldownUntil && this._samples.length > 3) {
      const s0 = this._samples[0];
      const dx = this.cursor.x - s0.x;
      const dy = this.cursor.y - s0.y;
      const v = this._velocity();
      const H = Math.abs(dx) > window.innerWidth * 0.15 &&
                Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(v.vx) > this._prof.swipeVx;
      const V = Math.abs(dy) > window.innerHeight * 0.16 &&
                Math.abs(dy) > Math.abs(dx) * 1.5 && Math.abs(v.vy) > this._prof.swipeVy;
      if (H || V) {
        this._swipeCooldownUntil = now + 850;
        this._samples.length = 0;
        this._emit('swipe', H
          ? { dir: dx > 0 ? 'right' : 'left', axis: 'x', vx: v.vx, vy: v.vy }
          : { dir: dy > 0 ? 'down' : 'up', axis: 'y', vx: v.vx, vy: v.vy });
      }
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
