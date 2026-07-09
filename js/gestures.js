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
    // the zoomed photo speaks a tiny vocabulary: fist, pinch, spread, open
    // palm. Swipes and flicks must not merely be ignored there — a detected
    // non-gesture still sets cooldowns and starved the fist (field log:
    // clench over a zoomed photo never landed). Dead means undetected.
    this.calmActs = false;
    // main enables it where something can actually move sideways (strip
    // chapters, lightbox). Elsewhere a diagonal snap must not be consumed
    // as a sideways sweep — on strip-less chapters that read as "scroll
    // sometimes swallows a stroke", the right-vs-left inconsistency Dmitry felt
    this.flickXEnabled = false;
    // the same law extended to the palm/fist vocabulary (field log: dead
    // palm-downs and phantom unclenches inside chapters each spent 0.6–1.5s
    // of neighbour cooldowns — his very next real stroke landed in silence,
    // which is the "unstable scroll" feel). main narrows each act to the
    // screens where it MEANS something; elsewhere it is not even detected.
    // Defaults match the present screen: dwell owns it, the palm is silent.
    this.swipeUpEnabled = false;     // chapter: the palm pushes the sheet up
    this.swipeDownEnabled = false;   // lightbox: the palm lets the photo go
    this.clenchEnabled = false;      // chapter/lightbox: the fist takes/holds
    this.unclenchEnabled = false;    // lightbox: the open palm releases
    this._noteAt = {};               // near-miss journal, throttled per tag

    this._relSamples = [];        // fingertip minus palm — the lazy-finger signal
    this._relDisp = 0;
    this._flickHoldUntil = 0;
    this._pinchBlockUntil = 0;    // no grabs while a flick's hand comes home
    // READING DIRECTION per axis (kinetic-scroll practice): in the air the
    // finger's trip home IS the opposite gesture — no glass to lift off from,
    // so per-stroke guessing is impossible (Dmitry nailed this in the field).
    // While momentum is warm, opposite strokes are returns by default; only a
    // decisively stronger stroke or a pause changes the direction of reading.
    this._mom = { x: null, y: null };   // {dir, vel, until}
    this._palmMom = null;               // recent palm-up energy guards "home"
    this._fistHeld = false;             // the fist as a clutch (lightbox layer)
    this._fistScreen = null;
    this._spreadGraceUntil = 0;         // zoom survives a flickering second hand
  }

  // the journal of refusals: a near-miss (the hand clearly attempted an act
  // and one gate said no) is logged with the gate's name. The field loop
  // was blind to these — the debug journal only showed what FIRED, and
  // "не уверен, учитывает ли он неудачные попытки" was exactly right: it
  // did not. Throttled per tag so a held posture doesn't flood the log.
  _note(tag, info) {
    const now = performance.now();
    if (this._noteAt[tag] && now - this._noteAt[tag] < 600) return;
    this._noteAt[tag] = now;
    this._emit('note', { tag, info });
  }

  // main reports whether a flick actually moved content. A stroke that met
  // a wall (chapter top, missing strip) may not hold the reading direction —
  // otherwise the first stroke of a session, often a return or a bounce,
  // locks momentum inverted and every real stroke after it goes silent.
  noteFlickEffect(axis, moved) {
    if (!moved && this._mom[axis]) this._mom[axis] = null;
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
    const dist2 = h2 ? Math.hypot(h.palm.x - h2.palm.x, h.palm.y - h2.palm.y) : 0;
    // A phantom "second hand" rides ON the real one (MediaPipe doubles a big
    // close hand) — field log: a 12s spread from one hand, scale driven by
    // the hand's own depth. Real palms can't overlap: distance is the tell.
    // The edge gate still guards the START only — a running spread survives
    // to the frame edges, where spreading hands naturally end up.
    // zoom is a two-OPEN-hands gesture: a fist panning a zoomed frame with
    // a second hand idling in view must not re-engage the scale (field log:
    // the zoom crawled while panning)
    const startReal = this.spreadEnabled && !this._fistHeld &&
      h2 && h2.size > 0.11 && h.size > 0.11 && dist2 > 0.09 &&
      h.open > 0.9 && h2.open > 0.9 &&
      inField(h) && inField(h2);
    const contReal = this.spreadEnabled && this._spread &&
      h2 && h2.size > 0.09 && dist2 > 0.065;
    const twoReal = this._spread ? contReal : startReal;
    this._twoFrames = twoReal ? (this._twoFrames || 0) + 1 : 0;
    if (twoReal && (this._spread || (this._twoFrames >= 4 && !this._grabLive && !this._pinched))) {
      if (!this._spread) {
        this._spread = { d0: Math.max(dist2, 0.05) };
        this._emit('spreadstart', {});
      } else {
        this._emit('spreadmove', { scale: dist2 / this._spread.d0 });
      }
      this._spreadLast = dist2 / this._spread.d0;
      this._spreadGraceUntil = now + 420;
      this.mode = 'spread';
      return;
    }
    if (this._spread && !twoReal) {
      // the second hand flickers in tracking constantly (field log: zoom
      // sessions shredded into 0.2-0.4s scraps with swipes firing in the
      // gaps) — hold the zoom through a short grace and resume seamlessly
      if (now < this._spreadGraceUntil) {
        this.mode = 'spread';
        return;
      }
      this._spread = null;
      this._emit('spreadend', { scale: this._spreadLast || 1 });
      // hands coming back from a zoom posture are still moving —
      // they may not speak for a moment through any one-hand act
      this._swipeCooldownUntil = Math.max(this._swipeCooldownUntil, now + 700);
      this._flickHoldUntil = Math.max(this._flickHoldUntil, now + 700);
      this._fistCooldownUntil = Math.max(this._fistCooldownUntil, now + 700);
      this._pinchBlockUntil = Math.max(this._pinchBlockUntil, now + 700);
      this._samples.length = 0;
      this._relSamples.length = 0;
    }

    if (!this.active) {
      this.active = true;
      this._pinchSlow = h.pinch;
      this._openSlow = h.open;
      // a re-acquired hand arrives mid-motion with empty baselines — field
      // log showed instant 0.3s phantom grabs right after enter; let the
      // baselines breathe before a pinch may engage
      this._pinchBlockUntil = Math.max(this._pinchBlockUntil, now + 280);
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
    this._relSamples.push({ rx: rel.x, ry: rel.y, px: h.palm.x, py: h.palm.y, o: h.open, t: now });
    while (this._relSamples.length && now - this._relSamples[0].t > 420) this._relSamples.shift();
    this._relDisp = 0;
    this._rel130 = null;               // the ~130ms-ago sample: openness cliff
    for (let i = this._relSamples.length - 1; i >= 0; i--) {
      if (now - this._relSamples[i].t >= 130) {
        this._rel130 = this._relSamples[i];
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
      // a collapsing fist is not a pinch; neither is a fingertip mid-flick,
      // nor the pause at the bottom of one — the stroke ends with the tip
      // resting by the thumb (pinch reads low, rel-motion reads calm) and
      // field logs showed phantom micro-grabs jerking the scroll right there.
      // The pinch is a FAMILY of grips, not one template (his traces,
      // 2026-07-08): the index pinch keeps the hand honestly open (o>0.85);
      // folding the middle or ring finger into the grip drags openness down
      // to ~0.6–0.8 — still a pinch. What separates a deep grip from a fist
      // assembling is the openness CLIFF over 130ms: a grip folds fingertips
      // (recorded Δo≈0.28), a fist folds the whole hand at once (Δo≈0.87).
      // Deep grips also demand a decisive thumb act (pinch under 0.26, deep
      // drop below the slow baseline) so a relaxed near-closed hand — whose
      // thumb already rests by the fingers — never drifts into a grab.
      const cliff = this._rel130 ? this._rel130.o - h.open : 1;
      const gripOpen = h.open > 0.85 ||
        (h.open > 0.55 && cliff < 0.45 &&
         h.pinch < 0.26 && this._pinchSlow - h.pinch > 0.25);
      const fingersOut = gripOpen && this._relDisp < 0.09 &&
        now > this._pinchBlockUntil;
      const pinchShape = h.pinch < 0.28 && this._pinchSlow - h.pinch > 0.10;
      const closingAct = fingersOut && pinchShape;
      const hardAct = fingersOut && h.pinch < 0.22 && this._pinchSlow - h.pinch > 0.18;
      if (pinchShape && !fingersOut) {
        if (now <= this._pinchBlockUntil) this._note('pinch ✗blocked', `${Math.round(this._pinchBlockUntil - now)}ms`);
        else if (!gripOpen) {
          if (h.open <= 0.55) this._note('pinch ✗curled', `o ${h.open.toFixed(2)}`);
          else if (cliff >= 0.45) this._note('pinch ✗cliff', `Δo ${cliff.toFixed(2)}`);
          else this._note('pinch ✗shallow', `p ${h.pinch.toFixed(2)} drop ${(this._pinchSlow - h.pinch).toFixed(2)}`);
        } else this._note('pinch ✗finger-flying', `rel ${this._relDisp.toFixed(2)}`);
      }
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
    // a fixed blend keeps one continuous point regardless of hand shape.
    // (A pointing-weighted lean was tried and field-reverted 09.07: the
    // 'pointing' flag flutters while aiming AT the screen — foreshortening
    // wrecks the extension metric — and the wandering weight made holds
    // less stable than the palm bias it was fixing. The aim-vs-palm story
    // needs a recorded trace, not a guess.)
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
    // Field logs: fast TRANSLATION blurs the landmarks and the fingers
    // "collapse" for a frame or two — so fist acts demand a PARKED PALM and
    // two frames. The gate used to measure cursor speed, but the cursor
    // rides the index finger, and an honest crisp clench IS a fast index
    // (his trace 2026-07-08: palm parked at 0.01/130ms, cursor at 1700px/s)
    // — crisp clenches died as "fast", and by the time the speed EMA cooled
    // the 400ms open-palm history had scrolled away, so they died again as
    // "history". The palm is what must stand still, so the palm is measured.
    const palmMove = this._rel130
      ? Math.hypot(h.palm.x - this._rel130.px, h.palm.y - this._rel130.py) : 1;
    // ...and its slow shadow: "the palm stands" must mean it has BEEN
    // standing (~0.4s), not that it stopped a moment ago — the tail of a
    // palm sweep parks the palm first while the finger settles down and
    // unfurls, which photographs exactly like a polite snap (field log
    // 02:29: a false step-back rode the tail of almost every down-sweep)
    this._palmMoveSlow = (this._palmMoveSlow ?? palmMove) +
      (palmMove - (this._palmMoveSlow ?? palmMove)) * 0.25;
    // a real clench assembles from the WHOLE open palm at once; a hand
    // relaxing after a swipe curls finger by finger, and the last fold
    // used to complete the "fist" and open a photo (field log: clench
    // 1.5-2.5s after every palm swipe, thumb still out). The history
    // gate is Dmitry's description verbatim: 400ms ago the palm was
    // honestly open, and it fell all the way from there.
    // And a fist is CLOSED: the field misfires (log 23:21 — finger-scroll
    // attempts opening photos) were half-curls at o 0.59–0.63; every
    // deliberate fist in the same logs sat at o ≤ 0.47. The absolute floor
    // separates the two populations the relative gates cannot.
    const r0o = this._relSamples.length > 3 ? this._relSamples[0].o : 0;
    const closeShape = h.open < 0.52 && this._openSlow - h.open > 0.35;
    const openShape = h.open > 1.22 && h.open - this._openSlow > 0.28;
    if (!this._pinched) {
      // the two directions are NOT symmetric (his field verdict: "разжатие
      // считывается хуже сжатия" — correct, and by construction). Closing
      // GRABS — wrong is expensive, so it keeps the strict discipline:
      // parked palm (0.05), full act cooldown, open-palm history. Opening
      // RELEASES — wrong is cheap, and it happens mid-glide, right after
      // the fist carried a photo: its palm gate breathes wider (0.12) and
      // it waits only a short settle after the clench instead of the 900ms
      // act cooldown (field: take→look→release under a second died as
      // ✗cooldown — "нужно попытками определить нужную скорость").
      const canClose = now > this._fistCooldownUntil && palmMove < 0.05;
      const canOpen = now - (this._fistActAt || 0) > 350 && palmMove < 0.12;
      // the fist speaks only where main gave it a meaning (dead means
      // undetected): a clench in a chapter/lightbox, an unclench over a
      // held fist or an open photo. Elsewhere the same shapes are just a
      // hand living its life — no event, no cooldowns spent.
      const closing = canClose && this.clenchEnabled && closeShape &&
        r0o > 0.95 && r0o - h.open > 0.5;
      const opening = canOpen && (this._fistHeld || this.unclenchEnabled) && openShape;
      if (this.clenchEnabled && closeShape && !closing) {
        if (now <= this._fistCooldownUntil) this._note('fist ✗cooldown', `${Math.round(this._fistCooldownUntil - now)}ms`);
        else if (palmMove >= 0.05) this._note('fist ✗moving-palm', palmMove.toFixed(3));
        else this._note('fist ✗history', `r0 ${r0o.toFixed(2)} o ${h.open.toFixed(2)}`);
      } else if (this.clenchEnabled && !closeShape && canClose &&
          h.open < 0.72 && this._openSlow - h.open > 0.35 && r0o > 0.95) {
        // would have fired under the old 0.72 gate — watch this tag in the
        // field: it validates (or refutes) the 0.52 floor
        this._note('fist ✗half-closed', `o ${h.open.toFixed(2)}`);
      }
      if ((this._fistHeld || this.unclenchEnabled) && openShape && !opening) {
        if (now - (this._fistActAt || 0) <= 350) this._note('unfist ✗settling', `${Math.round(350 - (now - this._fistActAt))}ms`);
        else this._note('unfist ✗moving-palm', palmMove.toFixed(3));
      }
      this._fistIn = closing ? (this._fistIn || 0) + 1 : 0;
      this._fistOut = opening ? (this._fistOut || 0) + 1 : 0;
      if (this._fistIn >= 2 || this._fistOut >= 2) {
        const type = this._fistIn >= 2 ? 'clench' : 'unclench';
        this._fistIn = 0; this._fistOut = 0;
        this._fistActAt = now;
        // the release leaves an open, settled hand — the next take may come
        // sooner (his slider rhythm hit the 900 with 4–136ms to spare)
        this._fistCooldownUntil = now + (type === 'clench' ? 900 : 700);
        this._swipeCooldownUntil = Math.max(this._swipeCooldownUntil, now + 600);
        this._openSlow = h.open;
        // the diagnostics ride the journal line — the scroll-read-as-fist
        // misfire Dmitry caught could not be recorded; now every clench
        // carries the values that let us judge it after the fact
        this._emit(type, {
          x: this.cursor.x, y: this.cursor.y,
          info: `o ${h.open.toFixed(2)} r0 ${r0o.toFixed(2)} pm ${palmMove.toFixed(3)}`,
        });
        if (type === 'clench') {
          this._fistHeld = true;          // the fist is now a clutch
          this._fistScreen = null;
        } else if (this._fistHeld) {
          this._fistHeld = false;
          this._emit('fistend', {});
        }
      }
    } else {
      this._fistIn = 0; this._fistOut = 0;
    }

    // ---- the held fist is a clutch (Dmitry's lightbox layer): what the
    // clench took, the moving fist now carries — main routes it to the
    // photo slider or, zoomed, to panning. A slow relax lets go silently
    // (no act, nothing closes); only the decisive unclench above speaks.
    if (this._fistHeld) {
      if (h.open > 1.0) {
        this._fistOpenish = (this._fistOpenish || 0) + 1;
        if (this._fistOpenish >= 3) {
          this._fistHeld = false;
          this._fistScreen = null;
          // visible in the journal: the system judged this a relax, not an
          // act — if a deliberate smooth open lands here, the tag tells us
          this._note('fist ↩relax', `o ${h.open.toFixed(2)}`);
          this._emit('fistend', {});
        }
      } else {
        this._fistOpenish = 0;
      }
      if (this._fistHeld) {
        const fx = ((1 - h.palm.x) - 0.5) * this.gain * vw + vw / 2;
        const fy = (h.palm.y - 0.5) * this.gain * vh + vh / 2;
        if (this._fistScreen) {
          this._emit('fistmove', {
            dx: fx - this._fistScreen.x, dy: fy - this._fistScreen.y, x: fx, y: fy,
          });
        }
        this._fistScreen = { x: fx, y: fy };
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
    // flick may not START from a true fist (r0.o), and stays quiet while a
    // second hand is in frame (zooming hands sweep — they must not flip
    // photos). Down-flicks need no explosion cap: a fist opens its
    // fingertips UPWARD relative to the palm, the wrong sign entirely.
    if (!this.grabbing && this._relSamples.length > 3) {
      const r0 = this._relSamples[0];
      const rN = this._relSamples[this._relSamples.length - 1];
      const drx = rN.rx - r0.rx, dry = rN.ry - r0.ry;
      const dopen = rN.o - r0.o;
      const rdt = Math.max(50, rN.t - r0.t) / 1000;
      // an honest downward finger stroke that lands in a silent window is
      // exactly the invisible failed attempt the field loop could not see
      const strokeY = dry > 0.15 && dry > Math.abs(drx) * 1.4;
      // the two-hands mute exists for ZOOMING hands (they sweep, and must
      // not flip photos) — so it lives only where the zoom itself lives.
      // In a chapter a phantom second blob used to kill every snap (field
      // log 02:19: ✗muted 2hands nineteen times, "палец перестал реагировать")
      const mutedBy = this._fistHeld ? 'fist' : this.calmActs ? 'calm' :
        now <= this._flickHoldUntil ? `hold ${Math.round(this._flickHoldUntil - now)}ms` :
        (this.spreadEnabled && h2 && h2.size > 0.08) ? '2hands' : null;
      if (mutedBy) {
        if (strokeY) this._note('flick↓ ✗muted', mutedBy);
      } else {
        let axis = null, dir, vel;
        // vertical is ONE-DIRECTIONAL by design (the cascade lesson): without
        // a clutch, a return/wind-up is geometrically the opposite stroke, and
        // every "smart" disambiguator we stacked just suppressed input — which
        // reads as lag. So only the downward snap is a gesture; upward finger
        // motion is a hand coming home and is not even a detection. The other
        // direction lives in a DIFFERENT family (Dmitry's split): palm swipe
        // up reads on, finger snap down steps back — each family is blind to
        // the other's parasitic motions.
        // And the snap is itself a FAMILY of exactly TWO templates (the
        // in-between turned out to be everyone else's strokes — field log
        // 02:05: a palm-led down-sweep with the fingers leading passed a
        // blanket relative gate and rained step-backs over his reading):
        //   polite — the finger works, the palm stands (his first traces);
        //   whip   — from a half-curl the whole finger unfurls (Δo +1.4…2.2
        //            recorded, nothing else explodes open like that) and the
        //            palm may ride along, but the fingertip still travels
        //            ~2× the palm. The EXPLOSION is the whip's signature —
        //            a palm sweep opens by +0.3 at best.
        // Direction already excludes the fist-opening parasite (its
        // fingertips fly UP relative to the palm).
        const palmDisp = Math.hypot(rN.px - r0.px, rN.py - r0.py);
        if (strokeY && r0.o > 0.4 && (
            (palmDisp < 0.06 && dopen > 0.06 && this._palmMoveSlow < 0.03) ||
            (palmDisp < dry * 0.45 && dopen > 0.5))) {
          axis = 'y'; dir = 'down';
          vel = (dry * window.innerHeight * this.gain) / rdt;
        } else if (this.flickXEnabled &&
            Math.abs(drx) > 0.17 && Math.abs(drx) > Math.abs(dry) * 1.4 &&
            r0.o > 0.55 && dopen < 0.6) {
          axis = 'x'; dir = drx < 0 ? 'right' : 'left';   // frame x is mirrored
          vel = (Math.abs(drx) * window.innerWidth * this.gain) / rdt;
        }
        if (!axis && strokeY) {
          // a real stroke, one gate said no — name the gate in the journal
          if (r0.o <= 0.4) this._note('flick↓ ✗from-fist', `o ${r0.o.toFixed(2)}`);
          else if (palmDisp >= 0.06 && dopen <= 0.5) this._note('flick↓ ✗palm-led', `pd ${palmDisp.toFixed(2)} Δo ${dopen.toFixed(2)}`);
          else if (palmDisp >= dry * 0.45) this._note('flick↓ ✗palm-moved', `${palmDisp.toFixed(3)} dry ${dry.toFixed(2)}`);
          else if (palmDisp < 0.06 && dopen > 0.06 && this._palmMoveSlow >= 0.03)
            this._note('flick↓ ✗palm-settling', this._palmMoveSlow.toFixed(3));
          else this._note('flick↓ ✗no-extension', `Δo ${dopen.toFixed(2)}`);
        }
        if (axis) {
          const m = this._mom[axis];
          const reversal = m && dir !== m.dir && now < m.until;
          if (reversal && vel < Math.max(axis === 'y' ? 1000 : 1600, m.vel * 1.55)) {
            // the finger going home for the next stroke — consume it silently
            this._relSamples.length = 0;
            this._note('flick ↩return', dir);
          } else {
            this._relSamples.length = 0;
            this._samples.length = 0;        // the same stroke is not also a palm swipe
            this._flickHoldUntil = now + 340; // same direction may repeat quickly
            // the finger's trip home is a rising, half-open hand — exactly a
            // palm-up's silhouette now that sweep purity is peak-based. The
            // families stay blind to each other's returns the honest way: we
            // KNOW a snap just happened, so "up" is deaf for its home corridor
            if (axis === 'y') this._swipeUpMuteUntil = now + 1500;
            // reading direction only exists where two directions do (galleries)
            if (axis === 'x') this._mom.x = { dir, vel, until: now + 2600 };
            this._swipeCooldownUntil = Math.max(this._swipeCooldownUntil, now + 800);
            this._fistCooldownUntil = Math.max(this._fistCooldownUntil, now + 700);
            this._pinchBlockUntil = now + 600;
            this._emit('flick', { axis, dir, vel });
          }
        }
      }
    }

    // ---- open-palm flings. "pure" = the hand was honestly open for the
    // WHOLE window (fingers apart, palm spread) — a failed pinch attempt
    // drifting away must never register as a closing brush.
    // two real hands where zoom is possible = a spread brewing, not a fling:
    // the spread needs 4 frames to confirm, and the moving palm used to fire
    // a swipe in that gap — photos flipped right before every zoom
    if (!this.grabbing && !this._fistHeld && !this.calmActs &&
        !(this.spreadEnabled && h2 && h2.size > 0.11) &&
        (mode === 'palm' || mode === 'hand') &&
        now > this._swipeCooldownUntil && this._samples.length > 3) {
      const s0 = this._samples[0];
      const dx = this.cursor.x - s0.x;
      const dy = this.cursor.y - s0.y;
      const v = this._velocity();
      const pure = this._samples.every((s) => s.o > 1.05 && s.p > 0.45);
      const sdir = dx > 0 ? 'right' : 'left';
      const sm = this._mom.x;   // swipes share the reading direction with flicks
      const sReturn = sm && sdir !== sm.dir && now < sm.until &&
        Math.abs(v.vx) < Math.max(1600, sm.vel * 1.55);
      if (Math.abs(dx) > window.innerWidth * 0.13 &&
          Math.abs(dx) > Math.abs(dy) * 1.6 && Math.abs(v.vx) > 1000) {
        if (sReturn) {
          this._note('swipe ↩return', sdir);
        } else {
          this._swipeCooldownUntil = now + 800;
          this._fistCooldownUntil = Math.max(this._fistCooldownUntil, now + 700);
          this._flickHoldUntil = Math.max(this._flickHoldUntil, now + 700);
          this._mom.x = { dir: sdir, vel: Math.abs(v.vx), until: now + 2600 };
          this._samples.length = 0;
          this._relSamples.length = 0;
          this._emit('swipe', { axis: 'x', dir: sdir, vx: v.vx, pure });
        }
      } else if (Math.abs(dy) > window.innerHeight * 0.18 &&
          Math.abs(dy) > Math.abs(dx) * 1.6 && Math.abs(v.vy) > 600) {
        // the palm family holds two directions and Dmitry reads BOTH ways —
        // so the return-guard window is short and soft: right after an
        // up-stroke a downward drift is the palm coming home; past ~2.2s a
        // down-stroke is a deliberate step back and rides free
        const sdirY = dy > 0 ? 'down' : 'up';
        const pm = this._palmMom;
        // every observed DOWN stroke — emitted, dead, slow or impure — arms
        // the home-guard for "up": the hand that just travelled down comes
        // back up, and with peak-based purity that return photographs as an
        // honest reading-push (field log 02:29: "откуда мах вверх?" — from
        // the returns). Same escape as every home-guard: decisively harder.
        if (sdirY === 'down') this._palmMomDown = { vel: Math.abs(v.vy), until: now + 1400 };
        // purity is directional. For UP, per-frame openness is a LIE inside
        // a fast stroke: motion smear "collapses" the fingers for a frame or
        // two (the same artifact the fist guards against) — his sweeps read
        // o 2.2 → 0.8 → 1.2 within one honest push, and any per-sample o
        // gate starves them. What an open-hand stroke can actually prove:
        // its PEAK openness (an honest palm shows o>1.15 somewhere in the
        // window; a failed-pinch drift or a lazy half-curl never does), and
        // the absence of a pinch in every frame (a spread hand pointing
        // down reads p 0.4–0.6 by geometry; a real pinch holds p<0.3).
        // The closing brush (down, lightbox) keeps the full ceremony.
        const oMin = Math.min(...this._samples.map((s) => s.o));
        const oMax = Math.max(...this._samples.map((s) => s.o));
        const pureY = sdirY === 'up'
          ? oMax > 1.1 && this._samples.every((s) => s.p > 0.3)
          : this._samples.every((s) => s.o > 1.05 && s.p > 0.45);
        // the speed floor is directional too: down CLOSES (a photo) and
        // demands decisiveness; up only reads on, and his graceful sweep
        // peaked at ~1100 — killed by the flat 1250 floor
        const vyFloor = sdirY === 'up' ? 900 : 1250;
        if (sdirY === 'up' && now < (this._swipeUpMuteUntil || 0)) {
          this._samples.length = 0;   // the finger coming home, not a call
          this._note('swipe ↩finger-home', `${Math.round(this._swipeUpMuteUntil - now)}ms`);
        } else if (Math.abs(v.vy) < vyFloor) {
          this._note('swipe ✗slow', `${sdirY} vy ${Math.round(Math.abs(v.vy))}`);
        } else if (!pureY) {
          // a big y-stroke with fingers not honestly open — the most common
          // shape of a palm swipe that "didn't work" in the field
          this._note('swipe ✗not-pure', `${sdirY} o ${oMin.toFixed(2)}..${oMax.toFixed(2)}`);
        } else if (sdirY === 'down' && pm && now < pm.until &&
            Math.abs(v.vy) < Math.max(1700, pm.vel * 1.45)) {
          this._samples.length = 0;          // the palm coming home, not a call
          this._note('swipe ↩home', '');
        } else if (sdirY === 'up' && this._palmMomDown && now < this._palmMomDown.until &&
            Math.abs(v.vy) < Math.max(1700, this._palmMomDown.vel * 1.45)) {
          this._samples.length = 0;          // the hand riding back up, not a call
          this._note('swipe ↩home-up', '');
        } else if (sdirY === 'down' ? !this.swipeDownEnabled : !this.swipeUpEnabled) {
          // the palm's word means nothing on this screen — dead means
          // undetected: no event, and none of the swipe/flick silence that
          // used to poison the very next real stroke (field log: dead
          // palm-downs inside chapters starved the finger and the palm both).
          // Only the physiological fist guard survives — a hand relaxing
          // after a big stroke still folds finger by finger.
          this._samples.length = 0;
          this._relSamples.length = 0;
          this._fistCooldownUntil = Math.max(this._fistCooldownUntil, now + 1500);
          this._note(`swipe ✗${sdirY}`, 'dead-here');
        } else {
          this._palmMom = sdirY === 'up' ? { vel: Math.abs(v.vy), until: now + 2200 } : null;
          // 450, not 900: same-direction repeats are safe (returns are
          // consumed by ↩home and dead-here, never by this cooldown), and
          // the field showed every second reading-stroke of a fast rhythm
          // dying as ✗cooldown
          this._swipeCooldownUntil = now + 450;
          // the hand relaxing after a palm swipe folds finger by finger and
          // completes a "fist" a second later (field: photo opened twice) —
          // the fist listens again only after the hand has truly settled
          this._fistCooldownUntil = Math.max(this._fistCooldownUntil, now + 1500);
          this._flickHoldUntil = Math.max(this._flickHoldUntil, now + 700);
          this._samples.length = 0;
          this._relSamples.length = 0;
          this._emit('swipe', { axis: 'y', dir: sdirY, vy: v.vy, pure: true });
        }
      }
    } else if (!this.grabbing && !this._fistHeld && !this.calmActs &&
        this._samples.length > 3 && now <= this._swipeCooldownUntil) {
      // the invisible half of "unstable": a real stroke landing in a silent
      // window. Displacement over the 300ms sample window is stroke enough.
      const s0 = this._samples[0];
      const dxm = this.cursor.x - s0.x, dym = this.cursor.y - s0.y;
      if (Math.abs(dym) > window.innerHeight * 0.18 && Math.abs(dym) > Math.abs(dxm) * 1.6)
        this._note('swipe ✗cooldown', `${Math.round(this._swipeCooldownUntil - now)}ms`);
    }
  }

  _dropHand() {
    if (this._grabLive) this._emit('grabend', { vx: 0, vy: 0 });
    if (this._fistHeld) {
      this._fistHeld = false;
      this._fistScreen = null;
      this._emit('fistend', {});
    }
    if (this._spread) {
      this._spread = null;
      this._emit('spreadend', { scale: this._spreadLast || 1 });
    }
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
