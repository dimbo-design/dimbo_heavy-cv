// Gesture interpretation over hand summaries.
//
// Design rule: a MINIMAL, conflict-free vocabulary built on two hand states:
//   open-ish hand → pointing (through your own reflection on the main screen)
//   pinch = grab in the air → drag, axis-locked; pull it to you / push it away
//   to dive a layer deeper / surface back up (size of the hand = depth)
// A quick pinch is a click. An open-palm fling flips (lightbox, strips).
// Grabs are recognized as an ACT of closing the fingers, never as a static
// posture — a relaxed hand keeps its fingers near each other and must stay free.

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
    this._grabStartAt = 0;
    this._grabStart = { x: 0, y: 0 };
    this._grabMoved = 0;
    this._grabLive = false;       // grabstart emitted (movement or time passed)

    this._lastSeen = 0;
    this._lastT = 0;
    this._swipeCooldownUntil = 0;
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
      this._pinchSlow = h.pinch;
      this._emit('enter', {});
    }

    // ---- grab: recognized as the ACT of pinching. A slow-moving baseline
    // remembers how far apart the fingers usually are; engaging requires the
    // distance to visibly DROP below it. A hand that arrives already-curled
    // never grabs by accident. Two frames confirm engage and release.
    this._pinchSlow += (h.pinch - this._pinchSlow) * 0.08;
    const wasGrabbing = this.grabbing;
    if (!this._pinched) {
      const closingAct = h.pinch < 0.28 && this._pinchSlow - h.pinch > 0.10;
      this._pinchIn = closingAct ? (this._pinchIn || 0) + 1 : 0;
      if (this._pinchIn >= 2) {
        this._pinched = true;
        this._pinchOut = 0;
        this._grabSize0 = h.size;
        this._zFired = false;
      }
    } else {
      this._pinchOut = h.pinch > 0.42 ? (this._pinchOut || 0) + 1 : 0;
      if (this._pinchOut >= 2) { this._pinched = false; this._pinchIn = 0; }
    }
    this.pinchStrength = clamp((0.55 - h.pinch) / 0.35, 0, 1);
    this.grabbing = this._pinched;

    let mode;
    if (this.grabbing) mode = 'grab';
    else if (h.pointing) mode = 'point';
    else if (h.open > 1.22) mode = 'palm';
    else mode = 'hand';
    this.mode = mode;
    this.hand = h;                 // raw frame-space geometry for the mirror

    // ---- cursor
    const src = mode === 'point' ? h.index : this.grabbing ? h.pinchPoint : h.palm;
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

    // ---- depth axis while grabbing: pull to you = dive, push away = surface
    if (this._pinched && !this._zFired && this._grabSize0) {
      const ratio = h.size / this._grabSize0;
      if (ratio > 1.26) {
        this._zFired = true;
        this._emit('pull', { x: this.cursor.x, y: this.cursor.y });
      } else if (ratio < 0.78) {
        this._zFired = true;
        this._emit('push', { x: this.cursor.x, y: this.cursor.y });
      }
    }

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
        this._emit('grabstart', { x: this._grabStart.x, y: this._grabStart.y });
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
      } else if (now - this._grabStartAt < 260 && this._grabMoved < 30) {
        this._emit('tap', { x: this.cursor.x, y: this.cursor.y });
      }
      this._grabLive = false;
    }

    // ---- open-palm horizontal fling: flips things (lightbox, strips)
    if (!this.grabbing && (mode === 'palm' || mode === 'hand') &&
        now > this._swipeCooldownUntil && this._samples.length > 3) {
      const s0 = this._samples[0];
      const dx = this.cursor.x - s0.x;
      const dy = this.cursor.y - s0.y;
      const v = this._velocity();
      if (Math.abs(dx) > window.innerWidth * 0.13 &&
          Math.abs(dx) > Math.abs(dy) * 1.6 && Math.abs(v.vx) > 1000) {
        this._swipeCooldownUntil = now + 800;
        this._samples.length = 0;
        this._emit('swipe', { dir: dx > 0 ? 'right' : 'left', vx: v.vx });
      }
    }
  }

  _dropHand() {
    if (this._grabLive) this._emit('grabend', { vx: 0, vy: 0 });
    this.active = false;
    this.mode = 'idle';
    this.grabbing = false;
    this._pinched = false;
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
