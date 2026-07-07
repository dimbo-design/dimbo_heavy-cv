// Gesture interpretation over hand summaries.
//
// Design rule: a MINIMAL, conflict-free vocabulary built on what one RGB
// camera can measure RELIABLY (field data killed the depth-by-hand-size axis:
// tracked size jitters ±35%):
//   open-ish hand → pointing · pinch-act = grab → drag, axis-locked
//   quick pinch = click · open-palm fling ⟷ = flip · open-palm brush ↓ = close
//   palm→fist clench = take (photo to full screen) · fist→palm = release it
//   two hands moving apart/together = zoom (2D palm distance is rock solid)
// All of it is ACTS (fast transitions vs a slow baseline), never postures.

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
    this._openSlow = 1;
    this._fistCooldownUntil = 0;
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

    const sorted = [...hands].sort((a, b) => b.size - a.size);
    const h = sorted[0];

    // ---- two hands: the distance between palms is the zoom axis
    const h2 = sorted[1];
    const inField = (p) => p.palm.x > 0.05 && p.palm.x < 0.95 && p.palm.y > 0.05 && p.palm.y < 0.95;
    if (h2 && h2.size > 0.09 && h.size > 0.09 && inField(h) && inField(h2)) {
      const dist2 = Math.hypot(h.palm.x - h2.palm.x, h.palm.y - h2.palm.y);
      if (!this._spread) {
        this._spread = { d0: Math.max(dist2, 0.05) };
        this._emit('spreadstart', {});
      } else {
        this._emit('spreadmove', { scale: dist2 / this._spread.d0 });
      }
      this._spreadLast = dist2 / this._spread.d0;
      // while both hands are working, single-hand grabs stand down
      if (this._grabLive) { this._emit('grabend', { vx: 0, vy: 0 }); this._grabLive = false; }
      this._pinched = false;
      this.grabbing = false;
      this.mode = 'spread';
      return;
    }
    if (this._spread) {
      this._spread = null;
      this._emit('spreadend', { scale: this._spreadLast || 1 });
    }

    if (!this.active) {
      this.active = true;
      this._pinchSlow = h.pinch;
      this._openSlow = h.open;
      this._emit('enter', {});
    }

    // ---- grab: recognized as the ACT of pinching. A slow-moving baseline
    // remembers how far apart the fingers usually are; engaging requires the
    // distance to visibly DROP below it. A hand that arrives already-curled
    // never grabs by accident. Two frames confirm engage and release.
    this._pinchSlow += (h.pinch - this._pinchSlow) * 0.08;
    const wasGrabbing = this.grabbing;
    if (!this._pinched) {
      const fingersOut = h.open > 0.85;      // a collapsing fist is not a pinch
      const closingAct = fingersOut && h.pinch < 0.28 && this._pinchSlow - h.pinch > 0.10;
      const hardAct = fingersOut && h.pinch < 0.22 && this._pinchSlow - h.pinch > 0.18;
      this._pinchIn = closingAct ? (this._pinchIn || 0) + 1 : 0;
      // a decisive snap engages instantly — quick "duck-quack" taps must land
      if (hardAct || this._pinchIn >= 2) {
        this._pinched = true;
        this._pinchOut = 0;
      }
    } else {
      const opened = h.pinch > 0.42;
      const wideOpen = h.pinch > 0.56;
      this._pinchOut = opened ? (this._pinchOut || 0) + 1 : 0;
      if (wideOpen || this._pinchOut >= 2) { this._pinched = false; this._pinchIn = 0; }
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

    // ---- clench / unclench: fast palm↔fist transitions against the slow
    // openness baseline. A relaxed hand floats mid-range and crosses neither.
    this._openSlow += (h.open - this._openSlow) * 0.08;
    if (!this._pinched && now > this._fistCooldownUntil) {
      if (h.open < 0.72 && this._openSlow - h.open > 0.35) {
        this._fistCooldownUntil = now + 700;
        this._swipeCooldownUntil = Math.max(this._swipeCooldownUntil, now + 600);
        this._openSlow = h.open;
        this._emit('clench', { x: this.cursor.x, y: this.cursor.y });
      } else if (h.open > 1.28 && h.open - this._openSlow > 0.35) {
        this._fistCooldownUntil = now + 700;
        this._swipeCooldownUntil = Math.max(this._swipeCooldownUntil, now + 600);
        this._openSlow = h.open;
        this._emit('unclench', { x: this.cursor.x, y: this.cursor.y });
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
      this._swipeCooldownUntil = Math.max(this._swipeCooldownUntil, now + 650);
      const quick = now - this._grabStartAt < 350 && this._grabMoved < 42;
      if (quick) {
        this._emit('tap', { x: this.cursor.x, y: this.cursor.y });
        if (this._grabLive) this._emit('grabend', { vx: 0, vy: 0 });
      } else if (this._grabLive) {
        this._emit('grabend', this._velocity());
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
        this._emit('swipe', { axis: 'x', dir: dx > 0 ? 'right' : 'left', vx: v.vx });
      } else if (mode === 'palm' &&
          dy > window.innerHeight * 0.15 &&
          dy > Math.abs(dx) * 1.6 && v.vy > 1000) {
        // strictly an OPEN palm brushing down — half-closed scroll flicks
        // must never close anything
        this._swipeCooldownUntil = now + 900;
        this._samples.length = 0;
        this._emit('swipe', { axis: 'y', dir: 'down', vy: v.vy });
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
