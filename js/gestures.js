// Gesture interpretation over hand summaries.
//
// Design rule: a MINIMAL, conflict-free vocabulary built on what one RGB
// camera can measure RELIABLY (field data killed the depth-by-hand-size axis:
// tracked size jitters ±35%):
//   open-ish hand → pointing · pinch-act = grab → drag, axis-locked
//   quick pinch = click · open-palm fling ⟷ = flip · open-palm brush ↓ = close
//   lazy finger flick (tip strokes, palm parked) = scroll/sweep without pinching
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
    this.spreadEnabled = false;   // main enables it inside the lightbox only

    this._relSamples = [];        // fingertip minus palm — the lazy-finger signal
    this._relDisp = 0;
    this._flickHoldUntil = 0;
    this._flickOppUntil = 0;
    this._flickOppDir = '';
    this._swipeOppUntil = 0;      // a sideways stroke's recoil may not answer back
    this._swipeOppDir = '';
  }

  // grab held without movement — the deliberate "close" charge in main
  grabStillMs(now) {
    return this.grabbing && !this._grabLive ? (now ?? performance.now()) - this._grabStartAt : 0;
  }

  ingest({ hands }) {
    const now = performance.now();
    if (!hands.length) {
      if (this.active && now - this._lastSeen > 500) this._dropHand();
      return;
    }
    this._lastSeen = now;

    const sorted = [...hands].sort((a, b) => b.size - a.size);
    const h = sorted[0];

    // ---- two hands: the distance between palms is the zoom axis
    // Phantom second hands live for a frame or two and used to murder grabs
    // mid-scroll. A real second hand must persist and be substantial, and a
    // live grab is never interrupted by it.
    const h2 = sorted[1];
    const inField = (p) => p.palm.x > 0.05 && p.palm.x < 0.95 && p.palm.y > 0.05 && p.palm.y < 0.95;
    // the edge/size gate guards the START only (against phantom hands);
    // a running spread survives to the frame edges — that's where spreading
    // hands naturally end up, and cutting it there killed the zoom mid-gesture
    const startReal = this.spreadEnabled &&
      h2 && h2.size > 0.11 && h.size > 0.11 && inField(h) && inField(h2);
    const contReal = this.spreadEnabled && h2 && this._spread;
    const twoReal = this._spread ? contReal : startReal;
    this._twoFrames = twoReal ? (this._twoFrames || 0) + 1 : 0;
    if (twoReal && (this._spread || (this._twoFrames >= 4 && !this._grabLive && !this._pinched))) {
      const dist2 = Math.hypot(h.palm.x - h2.palm.x, h.palm.y - h2.palm.y);
      if (!this._spread) {
        this._spread = { d0: Math.max(dist2, 0.05) };
        this._emit('spreadstart', {});
      } else {
        this._emit('spreadmove', { scale: dist2 / this._spread.d0 });
      }
      this._spreadLast = dist2 / this._spread.d0;
      this.mode = 'spread';
      return;
    }
    if (this._spread && !twoReal) {
      this._spread = null;
      this._emit('spreadend', { scale: this._spreadLast || 1 });
    }

    if (!this.active) {
      this.active = true;
      this._pinchSlow = h.pinch;
      this._openSlow = h.open;
      this._emit('enter', {});
    }

    // ---- fingertip motion RELATIVE to the palm — the lazy-finger signal.
    // A parked hand with a working index finger shows up here and almost
    // nowhere else. The rel-displacement also guards pinch-engage below: a
    // fingertip mid-sweep dips through the pinch thresholds on its way
    // (Dmitry's traces show 0.24 at the bottom of a flick) and must not grab.
    // Displacement over ~130ms, NOT instantaneous speed: a pointing finger's
    // landmarks jitter (field log: node selection went dead), and jitter sums
    // to nothing over a window while a real stroke covers honest distance.
    const rel = { x: h.index.x - h.palm.x, y: h.index.y - h.palm.y };
    this._relSamples.push({ rx: rel.x, ry: rel.y, o: h.open, t: now });
    while (this._relSamples.length && now - this._relSamples[0].t > 420) this._relSamples.shift();
    this._relDisp = 0;
    for (let i = this._relSamples.length - 1; i >= 0; i--) {
      if (now - this._relSamples[i].t >= 130) {
        this._relDisp = Math.hypot(rel.x - this._relSamples[i].rx, rel.y - this._relSamples[i].ry);
        break;
      }
    }

    // ---- grab: recognized as the ACT of pinching. A slow-moving baseline
    // remembers how far apart the fingers usually are; engaging requires the
    // distance to visibly DROP below it. A hand that arrives already-curled
    // never grabs by accident. Two frames confirm engage and release.
    this._pinchSlow += (h.pinch - this._pinchSlow) * 0.08;
    const wasGrabbing = this.grabbing;
    if (!this._pinched) {
      // a collapsing fist is not a pinch; neither is a fingertip mid-flick
      const fingersOut = h.open > 0.85 && this._relDisp < 0.09;
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

    // ---- cursor: a stable anatomical point. Switching between fingertip
    // and palm centre made the cursor hop whenever 'pointing' flickered —
    // a fixed blend keeps one continuous point regardless of hand shape
    const src = this.grabbing ? h.pinchPoint : {
      x: h.index.x * 0.55 + h.palm.x * 0.45,
      y: h.index.y * 0.55 + h.palm.y * 0.45,
    };
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

    this._samples.push({ x: this.cursor.x, y: this.cursor.y, t: now, o: h.open, p: h.pinch });
    while (this._samples.length && now - this._samples[0].t > 300) this._samples.shift();

    // ---- clench / unclench: fast palm↔fist transitions against the slow
    // openness baseline. A relaxed hand floats mid-range and crosses neither.
    this._openSlow += (h.open - this._openSlow) * 0.08;
    // Field logs: fast motion blurs the landmarks and the fingers "collapse"
    // for a frame or two — so fist acts demand a SLOW hand and two frames.
    // A real clench is done with a steady hand; a brush never is.
    if (!this._pinched && now > this._fistCooldownUntil && this.speed < 700) {
      const closing = h.open < 0.72 && this._openSlow - h.open > 0.35;
      const opening = h.open > 1.28 && h.open - this._openSlow > 0.35;
      this._fistIn = closing ? (this._fistIn || 0) + 1 : 0;
      this._fistOut = opening ? (this._fistOut || 0) + 1 : 0;
      if (this._fistIn >= 2 || this._fistOut >= 2) {
        const type = this._fistIn >= 2 ? 'clench' : 'unclench';
        this._fistIn = 0; this._fistOut = 0;
        this._fistCooldownUntil = now + 900;
        this._swipeCooldownUntil = Math.max(this._swipeCooldownUntil, now + 600);
        this._openSlow = h.open;
        this._emit(type, { x: this.cursor.x, y: this.cursor.y });
      }
    } else {
      this._fistIn = 0; this._fistOut = 0;
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
      this._flickHoldUntil = Math.max(this._flickHoldUntil, now + 650);
      const quick = now - this._grabStartAt < 350 && this._grabMoved < 42;
      if (quick) {
        this._emit('tap', { x: this.cursor.x, y: this.cursor.y });
        if (this._grabLive) this._emit('grabend', { vx: 0, vy: 0 });
      } else if (this._grabLive) {
        this._emit('grabend', this._velocity());
      }
      this._grabLive = false;
    }

    // ---- lazy finger flicks (Dmitry's recorded vocabulary): the fingertip
    // strokes while the palm stays parked, so everything reads on index−palm.
    // A vertical flick must EXTEND the finger (open rising) — the recoil that
    // follows curls it back, and a hand relaxing after pointing collapses the
    // same way; the extension gate rejects both (his traces: flick Δopen +0.4,
    // recoil −0.5, relax −0.1). Horizontal sweeps are arm-driven and lean on
    // an opposite-direction cooldown instead — the return stroke of a real
    // sweep came back slower and under threshold every time he recorded it.
    // A fist opening into a palm is ALSO a fingertip flying out with the hand
    // opening — field log: it read as "flick up" and its cooldown silenced
    // unclench entirely (the photo never let go). Hence the extra gates: a
    // flick may not START from a fist (r0.o), may not open explosively wide
    // (that's an unclench), and stays quiet while a second hand is in frame
    // (zooming hands sweep — they must not flip photos).
    if (!this.grabbing && now > this._flickHoldUntil && this._relSamples.length > 3 &&
        !(h2 && h2.size > 0.08)) {
      const r0 = this._relSamples[0];
      const rN = this._relSamples[this._relSamples.length - 1];
      const drx = rN.rx - r0.rx, dry = rN.ry - r0.ry;
      const dopen = rN.o - r0.o;
      const rdt = Math.max(50, rN.t - r0.t) / 1000;
      let axis = null, dir, vel;
      if (Math.abs(dry) > 0.15 && Math.abs(dry) > Math.abs(drx) * 1.4 &&
          r0.o > 0.6 && dopen > 0.06 && dopen < 0.6) {
        axis = 'y'; dir = dry > 0 ? 'down' : 'up';
        vel = (Math.abs(dry) * window.innerHeight * this.gain) / rdt;
      } else if (Math.abs(drx) > 0.17 && Math.abs(drx) > Math.abs(dry) * 1.4 &&
          r0.o > 0.55 && dopen < 0.6) {
        axis = 'x'; dir = drx < 0 ? 'right' : 'left';   // frame x is mirrored
        vel = (Math.abs(drx) * window.innerWidth * this.gain) / rdt;
      }
      // an opposite stroke soon after reads as the hand coming home — unless
      // it's decisively fast (a real reversal cuts through the block)
      const flickBlocked = dir === this._flickOppDir && now < this._flickOppUntil && vel < 1700;
      if (axis && !flickBlocked) {
        this._relSamples.length = 0;
        this._samples.length = 0;          // the same stroke is not also a palm swipe
        this._flickHoldUntil = now + 340;  // same direction may repeat quickly
        this._flickOppDir = axis === 'y' ? (dir === 'down' ? 'up' : 'down')
          : (dir === 'left' ? 'right' : 'left');
        // vertical recoils are already killed by the extension gate, so ↕ may
        // change its mind quickly; ⟷ has no such shield and keeps the long block
        this._flickOppUntil = now + (axis === 'y' ? 450 : 1600);
        if (axis === 'x') {
          this._swipeOppDir = this._flickOppDir;
          this._swipeOppUntil = now + 1600;
        }
        this._swipeCooldownUntil = Math.max(this._swipeCooldownUntil, now + 800);
        this._fistCooldownUntil = Math.max(this._fistCooldownUntil, now + 700);
        this._emit('flick', { axis, dir, vel });
      }
    }

    // ---- open-palm flings. "pure" = the hand was honestly open for the
    // WHOLE window (fingers apart, palm spread) — a failed pinch attempt
    // drifting away must never register as a closing brush.
    if (!this.grabbing && (mode === 'palm' || mode === 'hand') &&
        now > this._swipeCooldownUntil && this._samples.length > 3) {
      const s0 = this._samples[0];
      const dx = this.cursor.x - s0.x;
      const dy = this.cursor.y - s0.y;
      const v = this._velocity();
      const pure = this._samples.every((s) => s.o > 1.05 && s.p > 0.45);
      if (Math.abs(dx) > window.innerWidth * 0.13 &&
          Math.abs(dx) > Math.abs(dy) * 1.6 && Math.abs(v.vx) > 1000 &&
          !((dx > 0 ? 'right' : 'left') === this._swipeOppDir &&
            now < this._swipeOppUntil && Math.abs(v.vx) < 1700)) {
        this._swipeCooldownUntil = now + 800;
        this._fistCooldownUntil = Math.max(this._fistCooldownUntil, now + 700);
        this._flickHoldUntil = Math.max(this._flickHoldUntil, now + 700);
        // the recoil of this stroke may not fire back — through EITHER detector
        this._swipeOppDir = dx > 0 ? 'left' : 'right';
        this._swipeOppUntil = now + 1600;
        this._flickOppDir = this._swipeOppDir;
        this._flickOppUntil = now + 1600;
        this._samples.length = 0;
        this._relSamples.length = 0;
        this._emit('swipe', { axis: 'x', dir: dx > 0 ? 'right' : 'left', vx: v.vx, pure });
      } else if (pure &&
          Math.abs(dy) > window.innerHeight * 0.18 &&
          Math.abs(dy) > Math.abs(dx) * 1.6 && Math.abs(v.vy) > 1250) {
        this._swipeCooldownUntil = now + 900;
        this._fistCooldownUntil = Math.max(this._fistCooldownUntil, now + 700);
        this._flickHoldUntil = Math.max(this._flickHoldUntil, now + 700);
        this._samples.length = 0;
        this._relSamples.length = 0;
        this._emit('swipe', { axis: 'y', dir: dy > 0 ? 'down' : 'up', vy: v.vy, pure: true });
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
    this._relSamples.length = 0;
    this._relDisp = 0;
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
