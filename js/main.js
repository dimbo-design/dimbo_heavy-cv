// Orchestrator: state machine, presence signals, gestures, DOM choreography.
//
// States: boot → (invite) → watching ⇄ present ⇄ space(chapter)
//                ↘ denied / failed          mobile is a separate early exit.
//
// Main screen: your reflection is the pointer — its fingertip touches the
// node labels directly; dwell fills a bar on the node, then it opens.
// Chapters: pinch = grab the matter (axis-locked), throw it away to close.
// Silent fallbacks everywhere: click, wheel, drag, Esc.

import { CONFIG } from './config.js';
import { NODES, UI, renderPanel } from './content.js';
import { Field } from './scene.js';
import { DepthEngine } from './depth.js';
import { HandsEngine } from './hands.js';
import { PoseEngine } from './pose.js';
import { Gestures } from './gestures.js';
import { ghost } from './ghost.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- environment

const isMobile =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && !matchMedia('(pointer: fine)').matches) ||
  window.innerWidth < 700;   // below the gate the camera never starts

let lang = localStorage.getItem('lang') ||
  ((navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en');

// the interface remembers a returning visitor · ?fresh forgets you
// (for first-touch testing after your own hands have learned the site)
if (new URLSearchParams(location.search).has('fresh')) {
  try {
    for (const k of ['visited', 'lang', 'gl_open', 'gl_close',
      'gl_teach_scroll', 'gl_teach_photo']) localStorage.removeItem(k);
  } catch (_) { /* ok */ }
}
// in-object hints: they live in the sub-label slots and die after the
// first success — the object teaches, nothing overlays
const learned = {
  open: !!localStorage.getItem('gl_open'),
};
const returning = !!localStorage.getItem('visited') &&
  !new URLSearchParams(location.search).has('fresh');
try { localStorage.setItem('visited', '1'); } catch (_) { /* private mode */ }

// ---------------------------------------------------------------- signals

class Signals {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0; this.frac = 0; this.motion = 0;
    this.cx = 0.5; this.cy = 0.5;
    this.present = false;
    this.proximity = 0;
    this.baseline = 0;
    this.motionPeak = 0;
    this.usePose = false;
    this.vis = 0;
    this.shoulders = null;
    this.panelOpen = false;
    this.openBaseline = 0;
    this.lastLeanEnd = 0;
    this._enterAt = null;
    this._exitAt = null;
    this._leanAt = null;
    this._closeAt = null;
  }

  // Presence and head from the SKELETON — precise entry/exit, and a head
  // that stays the head when a hand is raised (the depth centroid didn't).
  feedPose(p, now) {
    const c = this.cfg;
    this.usePose = true;
    ema(this, 'vis', p.vis, 0.35);
    if (p.head && p.vis > 0.35) {
      ema(this, 'cx', 1 - p.head.x, 0.25);        // mirrored
      ema(this, 'cy', p.head.y, 0.25);
    }
    if (p.shoulders) this.shoulders = p.shoulders;

    if (!this.present) {
      if (this.vis > c.poseEnter) {
        this._enterAt ??= now;
        if (now - this._enterAt > c.poseEnterMs) {
          this.present = true;
          this._enterAt = null;
          this.baseline = this.proximity;
          this.onPresence?.(true);
        }
      } else this._enterAt = null;
    } else {
      if (this.vis < c.poseExit) {
        this._exitAt ??= now;
        if (now - this._exitAt > c.poseExitMs) {
          this.present = false;
          this._exitAt = null;
          this.onPresence?.(false);
        }
      } else this._exitAt = null;
    }
  }

  feed(stats, now) {
    const c = this.cfg;
    const compact = 1 - clamp((stats.spread - c.spreadLo) / (c.spreadHi - c.spreadLo), 0, 1);
    const rawScore = clamp(stats.frac / 0.10, 0, 1) * compact;

    ema(this, 'score', rawScore, 0.30);
    ema(this, 'frac', stats.frac, 0.30);
    ema(this, 'motion', stats.motion, 0.25);
    if (!this.usePose) {
      ema(this, 'cx', 1 - stats.cx, 0.22);        // mirrored
      ema(this, 'cy', stats.cy, 0.22);
    }

    this.motionPeak = Math.max(this.motionPeak * 0.96, stats.motion);

    this.proximity += (clamp((this.frac - c.proxMin) / (c.proxMax - c.proxMin), 0, 1)
      - this.proximity) * 0.25;

    if (this.usePose) return;                      // skeleton owns presence

    if (!this.present) {
      const eligible = this.score > c.enterScore && this.motionPeak > c.motionGate;
      if (eligible) {
        this._enterAt ??= now;
        if (now - this._enterAt > c.enterMs) {
          this.present = true;
          this._enterAt = null;
          this.baseline = this.proximity;
          this.onPresence?.(true);
        }
      } else this._enterAt = null;
    } else {
      if (this.score < c.exitScore) {
        this._exitAt ??= now;
        if (now - this._exitAt > c.exitMs) {
          this.present = false;
          this._exitAt = null;
          this.onPresence?.(false);
        }
      } else this._exitAt = null;
    }

    if (this.present) {
      if (!this.panelOpen) {
        this.baseline += (this.proximity - this.baseline) * 0.02;
        const leaning = this.proximity - this.baseline > c.leanDelta;
        if (leaning && now - this.lastLeanEnd > c.reopenBlockMs) {
          this._leanAt ??= now;
          if (now - this._leanAt > c.leanMs) {
            this._leanAt = null;
            this.openBaseline = this.baseline;
            this.onLeanIn?.();
          }
        } else this._leanAt = null;
      } else {
        const backed = this.proximity < this.openBaseline - c.closeDelta ||
                       this.proximity < this.baseline - c.closeDelta;
        if (backed) {
          this._closeAt ??= now;
          if (now - this._closeAt > c.closeMs) {
            this._closeAt = null;
            this.onLeanBack?.();
          }
        } else this._closeAt = null;
      }
    }
  }
}

function ema(o, k, v, a) { o[k] += (v - o[k]) * a; }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// ---------------------------------------------------------------- app

const app = {
  state: 'boot',            // boot | watching | present | denied | failed
  spaceId: null,
  focusedId: null,
  nodesShown: false,
  cameraOn: false,
  modelReady: false,
  handsReady: false,
  handsFailed: false,
  poseReady: false,
  poseFailed: false,
  glog: [],                 // last recognized gesture events (debug)
  glogFull: [],             // whole-session log, copyable from the panel
  rec: null,                // raw hand trace (⌥R): fuel for the finger workshop
  grec: null, grecOn: false,   // fat trace (⌥G): full skeletons for the ghost teacher
  grecD: null, _grecBox: null, // …and the depth stream: the REAL hand, cropped
  hoverDl: null,            // a[data-dl] under the hand cursor
  focusChangedAt: 0,
  device: null,
  loadP: 0,
  presentSince: 0,
  nodePos: new Map(),       // id → {x, y} screen px
  pointer: null,            // fingertip of the REFLECTION, screen px (main screen)
  lastDepth: null,
  glyphUntil: 0,                // the form is briefly words (the easter egg)
  glyphWasOn: false, glyphExitAt: 0, glyphExitHold: 0,
  signFrames: 0, signLast: null, signCooldownUntil: 0,
  handAliveAt: 0, handAnchor: null,   // dwell trusts only a hand that has moved
  hold: { p: 0, target: null, until: 0 },
  ghost: null, lastGhostAt: 0, lastHandAt: 0,   // the reflection demonstrates
  mouseAt: null, mouseHover: null,              // …and answers the mouse
  ghintOpen: {}, ghintCtx: null,                // the visitor's own toggle,
                                                // sticky per screen, all session
  lbCooldownUntil: 0,
  scroll: { y: 0, target: 0, vel: 0, max: 0, over: 0 },
  pageX: 0, pageXVel: 0,    // chapter grabbed/thrown sideways
  strips: [],
  drag: null,               // null | {kind:'strip'|'scroll'|'stir'|'lightbox', ...}
  lb: null,                 // lightbox: {items:[{src,cap}], idx, acc}
  lastActivity: 0,
  lastPulse: 0,
};

window.__app = app;   // debug / integration-test hook
if (new URLSearchParams(location.search).has('debug')) {
  addEventListener('DOMContentLoaded', () => $('debug')?.classList.remove('hidden'));
}

// ?zero — the photo booth: only the particle form, no interface at all.
// Hands and gestures never start, nodes never reveal (which also silences
// the ghost — it needs nodes to reach for). The owner's screenshot mode.
const isZero = new URLSearchParams(location.search).has('zero');
if (isZero) {
  addEventListener('DOMContentLoaded', () => document.body.classList.add('zero'));
}

if (isMobile) {
  mobileBoot();
} else {
  boot();
}

// the mobile DEGRADATION (owner's call, 09.07): not a dead-end — the same
// portfolio, reflowed. Below the gate the camera pipeline never starts and
// no models download; the particle field stays as a dormant backdrop (one
// draw call — and wrapped: a failing WebGL must not fail the portfolio).
// Navigation is native: taps land on the same click fallbacks the mouse
// uses, the finger scrolls real overflow. Chapters, galleries, the
// lightbox and both languages all work; only the mirror is absent.
function mobileBoot() {
  document.body.classList.add('is-mobile', 'named');
  renderStatic();
  app.state = 'mobile';
  hide('invite');   // the camera invitation belongs to the mirror tiers
  try {
    const field = new Field($('scene'));
    app.field = field;
    window.addEventListener('resize', () => field.resize());
    const tick = () => { field.frame(1 / 60); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  } catch (_) { /* no WebGL: the dark stays plain, the portfolio stays open */ }
  buildNodes();
  revealNodes();
  document.addEventListener('click', (e) => {
    if (app.lb) {
      const r = $('lb-img').getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right ||
          e.clientY < r.top || e.clientY > r.bottom) closeLightbox();
      else lightboxStep(e.clientX > r.left + r.width / 2 ? 1 : -1);
      return;
    }
    const fig = e.target.closest('#space-inner figure');
    if (fig) { openLightbox(fig); return; }
  });
  $('space-close').addEventListener('click', () => closeSpace());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (app.lb) closeLightbox(); else closeSpace(); }
  });
}

function boot() {
  renderStatic();

  const field = new Field($('scene'));
  const engine = new DepthEngine();
  const hands = new HandsEngine();
  const pose = new PoseEngine();
  const gestures = new Gestures();
  const signals = new Signals(CONFIG.presence);
  // NB: app.ghost is TAKEN — it's the fabric-glow ambient's state. The
  // teacher (the recorded-hand being) lives under its own name.
  Object.assign(app, { field, engine, hands, pose, gestures, signals, teacher: ghost });
  ghost.mount();   // the stage exists from day one; the being waits for clips

  // ?teacher=scroll|photo — the look-validation loop: play the owner's
  // recorded clip on the stage, mock sheet behind, three passes. No
  // triggers, no death book — those come after the look is approved.
  const clip = new URLSearchParams(location.search).get('teacher');
  if (clip) {
    setTimeout(async () => {
      try {
        const frames = await ghost.load(clip);
        // the sheet stands left, the hand plays right where it was
        // recorded — no anchoring (the owner, 12.07: the hint hand does
        // NOT sit over the content, same as a real right-hand reach)
        // gain over the cursor's: the demonstration owns the screen,
        // its edges dissolved by the radial fade (the owner, 12.07)
        // the pinch plays at the recording's own scale and place (the
        // owner, 12.07: the blowup read as distortion — «не как я
        // записывал»); the photo keeps its tuned −10% of the wide gain
        ghost.play(frames, {
          gain: gestures.gain * (clip === 'photo' ? 1.45 * 0.9 : 1),
          loops: 3, mock: true,
          dim: (on) => {
            field.setTeachDim(on);
            document.body.classList.toggle('teaching', on);
          },
          act: clip === 'scroll' ? 'sheet' : 'gallery',
        });
      } catch { /* unknown clip name — the stage stays dark */ }
    }, 1800);
  }

  // ---- the being's real life (the owner's spec, 12.07). Born on
  // stalling: a live hand in a chapter whose content stands still.
  // Learned in order — the photo lesson waits until scrolling is
  // learned, and only speaks over a photo actually on screen. Dies on
  // the first real success (localStorage, ?fresh forgets). Each hint
  // repeats every 45s until learned; after any demonstration the
  // OTHER one holds 35s of silence — cooldowns never stack. ?teacher
  // keeps the stage for look-validation only.
  const teach = app.teach = {
    scrollDead: !!localStorage.getItem('gl_teach_scroll'),
    photoDead: !!localStorage.getItem('gl_teach_photo'),
    scrollNextAt: 0, photoNextAt: 0, lastEndAt: 0,
    stillAt: performance.now(), calmAt: performance.now(),
    lastScrollY: 0, acc: 0,
  };
  // the lesson teaches the pinch — only the pinch counts as learned.
  // Palm sweeps and finger snaps scroll too, but they are not this
  // word (the owner, 12.07: не любой скролл жестом, только щипком)
  app.teachScrolled = (px) => {
    if (teach.scrollDead) return;
    teach.acc += Math.abs(px);
    if (teach.acc > 60) teachLearned('scroll');
  };
  function teachLearned(which) {
    if (which === 'scroll' && !teach.scrollDead) {
      teach.scrollDead = true;
      localStorage.setItem('gl_teach_scroll', '1');
    }
    if (which === 'photo' && !teach.photoDead) {
      teach.photoDead = true;
      localStorage.setItem('gl_teach_photo', '1');
    }
    // a visitor acting is a visitor taught — the lesson yields at once
    if (ghost.playing) ghost.stop();
  }
  app.teachLearned = teachLearned;
  // a grip or a fist means the hand is busy acting, not stalled
  for (const ev of ['grabstart', 'clench']) {
    gestures.addEventListener(ev, () => {
      teach.stillAt = teach.calmAt = performance.now();
    });
  }
  if (!clip) {
    setInterval(() => {
      if (!app.cameraOn || ghost.playing) return;
      const now = performance.now();
      const hand = !!gestures.hand;
      const inChapter = app.spaceId && !app.lb;
      if (Math.abs(app.scroll.y - teach.lastScrollY) > 3) {
        teach.lastScrollY = app.scroll.y;
        teach.stillAt = now;
      }
      if (!inChapter || !hand || app.scroll.max <= 0) teach.stillAt = now;
      if (!inChapter || !hand || !stripImageOnScreen()) teach.calmAt = now;
      if (now - teach.lastEndAt < 35000) return;
      if (!teach.scrollDead && now > teach.scrollNextAt
        && now - teach.stillAt > 6000) { teachPlay('scroll'); return; }
      if (teach.scrollDead && !teach.photoDead && now > teach.photoNextAt
        && now - teach.calmAt > 8000) teachPlay('photo');
    }, 500);
  }
  // the lesson only makes sense over a photo the visitor can see
  function stripImageOnScreen() {
    for (const f of document.querySelectorAll('#space-inner .strip figure')) {
      const r = f.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) return true;
    }
    return false;
  }
  async function teachPlay(name) {
    teach[`${name}NextAt`] = performance.now() + 45000;
    try {
      app._teachClips ??= {};
      const frames = (app._teachClips[name] ??= await ghost.load(name));
      if (!app.cameraOn || ghost.playing || app.lb || !app.spaceId) return;
      ghost.play(frames, {
        gain: gestures.gain * (name === 'photo' ? 1.45 * 0.9 : 1),
        loops: 2, mock: true,
        dim: (on) => {
          field.setTeachDim(on);
          document.body.classList.toggle('teaching', on);
        },
        act: name === 'scroll' ? 'sheet' : 'gallery',
        onend: () => { teach.lastEndAt = performance.now(); },
      });
    } catch { /* clip missing — the being stays unborn */ }
  }

  for (const n of NODES) field.addAnchor(n.id, n.anchor);
  buildNodes();

  // -- depth pipeline
  engine.addEventListener('progress', (e) => {
    app.loadP = e.detail.p;
    field.setTargets({ progress: 0.12 + 0.88 * e.detail.p });
  });
  engine.addEventListener('ready', (e) => {
    app.modelReady = true;
    app.device = e.detail.device;
    field.setTargets({ progress: 1 });
  });
  engine.addEventListener('fatal', () => enterFailed());
  setInterval(() => {
    const sh = signals.shoulders;
    if (sh && signals.present) {
      // leaned back = smaller shoulders = slower, deeper breath of the form
      const relax = 1 - clamp((sh.width - 0.16) / 0.18, 0, 1);
      field.setPosture(relax);
    }
  }, 500);

  engine.addEventListener('depth', (e) => {
    const nowD = performance.now();
    if (nowD < app.glyphUntil) return;           // the words hold the stage
    const { data, width, height, stats } = e.detail;
    if (app.grecOn && app._grecBox) {
      // the fat trace, depth stream: the hint must be made of the same
      // flesh as the form (the owner's verdict 12.07: a hand rebuilt
      // from landmarks is math, not him) — so ⌥G also keeps the raw
      // depth crop around the tracked hand, artifacts and all
      const bb = app._grecBox;
      const x0 = Math.max(0, Math.floor(bb.x0 * width));
      const x1 = Math.min(width, Math.ceil(bb.x1 * width));
      const y0 = Math.max(0, Math.floor(bb.y0 * height));
      const y1 = Math.min(height, Math.ceil(bb.y1 * height));
      if (x1 > x0 && y1 > y0) {
        const w = x1 - x0, hh = y1 - y0;
        const crop = new Uint8Array(w * hh);
        for (let y = 0; y < hh; y++) {
          crop.set(data.subarray((y0 + y) * width + x0, (y0 + y) * width + x1), y * w);
        }
        app.grecD.push({
          t: +(performance.now() / 1000).toFixed(3),
          x: x0 / width, y: y0 / height, w, h: hh, fw: width, fh: height,
          d: b64u8(crop),
        });
        if (app.grecD.length > 160) app.grecD.shift();
      }
    }
    if (app.glyphWasOn) {
      // the words let go the way they arrived, in strict order: scatter
      // first (depth still frozen), then ONE slow crossfade back to the
      // body — and the freeze holds until that crossfade has finished,
      // or the very next regular frame stomps it at fast tempo (the
      // "abrupt return" Dmitry caught)
      if (!app.glyphExitAt) {
        // 720ms: the words get time to truly dissolve before the body returns
        app.glyphExitAt = nowD + 720;
        field.setTargets({ coherence: 0.18 });
        field.pulse(0.14);                // the words let go with a light burst
        return;
      }
      if (nowD < app.glyphExitAt) return;
      app.glyphWasOn = false;
      app.glyphExitAt = 0;
      app.glyphExitHold = nowD + 950;
      if (app.state === 'present') {
        field.setTargets({ coherence: CONFIG.coherence.present });
      }
      field.pulse(0.05, 0, -1.7);         // a whisper of a wave from the torso
      // the body paints back in from the torso outward — the radial reveal
      field.setDepth(data, width, height, 900, { x: 0, y: -1.7 });
      app.lastDepth = { data, width, height };
      return;
    }
    if (nowD < app.glyphExitHold) {
      // the wave keeps travelling, but its TARGET stays live — no stop-frame
      // of the visitor, no jump when the stream resumes
      field.updateLiveB(data, width, height);
      app.lastDepth = { data, width, height };
      return;
    }
    field.setDepth(data, width, height, engine.inferMs);
    app.lastDepth = { data, width, height };     // texture copies; safe to keep
    signals.feed(stats, performance.now());
  });

  // -- presence semantics
  signals.onPresence = (on) => on ? enterPresent() : leavePresent();
  // lean-based open/close is deliberately gone: proximity was firing
  // by accident and eroded trust in the whole gesture layer

  // -- skeleton pipeline: presence + head (depth heuristics stay as fallback)
  pose.addEventListener('ready', () => { app.poseReady = true; });
  pose.addEventListener('fatal', () => { app.poseFailed = true; });
  pose.addEventListener('pose', (e) => signals.feedPose(e.detail, performance.now()));

  // -- hand pipeline
  hands.addEventListener('ready', () => { app.handsReady = true; });
  hands.addEventListener('fatal', () => { app.handsFailed = true; });
  hands.addEventListener('hands', (e) => {
    gestures.ingest(e.detail);
    const h = e.detail.hands[0];
    // the easter egg: the mirror answers in the visitor's own language.
    // Six consecutive frames — an accidental flash of a sign is not a sign.
    // ALL hands are read, and the finger outranks the V: with two hands up,
    // MediaPipe sometimes weaves landmarks across wrists and a false PEACE
    // is born — the real fack on the other hand must win. Two facks get
    // their own answer: the mirror takes offence.
    const signs = e.detail.hands.map((hh) => hh?.sign).filter(Boolean);
    // the two-hand heart (his request, the macOS gesture): index tips kiss
    // at the top, thumbs meet below, and the palms stand APART — a phantom
    // hand rides on its host and can never hold a heart open. Accidental
    // hands don't fold into this; the strictness costs nothing.
    const [ha, hb] = e.detail.hands;
    const heart = !!(ha && hb && ha.thumb && hb.thumb &&
      ha.size > 0.09 && hb.size > 0.09) && (() => {
      const di = Math.hypot(ha.index.x - hb.index.x, ha.index.y - hb.index.y);
      const dt = Math.hypot(ha.thumb.x - hb.thumb.x, ha.thumb.y - hb.thumb.y);
      const dp = Math.hypot(ha.palm.x - hb.palm.x, ha.palm.y - hb.palm.y);
      const rise = (ha.thumb.y + hb.thumb.y) / 2 - (ha.index.y + hb.index.y) / 2;
      return di < 0.09 && dt < 0.13 && rise > 0.04 && dp > 0.06 && dp < 0.5;
    })();
    // two hands, two different signs → the winner speaks (owner's
    // hierarchy: the fack outranks everything, then the heart, the V,
    // and the like concedes to all)
    let sgn = null;
    if (signs.includes('fack')) {
      sgn = signs.filter((s) => s === 'fack').length >= 2 ? 'fack2' : 'fack';
    } else if (heart) {
      sgn = 'heart';
    } else if (signs.includes('peace')) {
      sgn = 'peace';
    } else if (signs.includes('like')) {
      sgn = 'like';
    }
    const fam = (s) => (s && s.startsWith('fack') ? 'fack' : s);
    app.signFrames = sgn && fam(sgn) === fam(app.signLast) ? app.signFrames + 1 : (sgn ? 1 : 0);
    app.signLast = sgn;
    const nowS = performance.now();
    // peace needs a longer stand than the fack: a pointing hand is one
    // flicker of the middle finger away from a V (field: PEACE fired
    // during plain navigation), while nobody points with the middle finger
    const needFrames = fam(sgn) === 'peace' ? 10
      : fam(sgn) === 'heart' || fam(sgn) === 'like' ? 8 : 6;
    if (sgn && app.signFrames >= needFrames && nowS > app.signCooldownUntil &&
        app.state === 'present' && !app.spaceId && !app.lb) {
      app.signCooldownUntil = nowS + 16000;
      app.glyphUntil = nowS + 3400;
      app.glyphWasOn = true;
      document.body.classList.add('glyph-on');
      setTimeout(() => document.body.classList.remove('glyph-on'), 4300);
      // the REAL morph is the site's own birth animation (Dmitry's spec:
      // "like the points first forming the figure"): the form scatters
      // into drift, the words assemble out of the drift
      field.setTargets({ coherence: 0.18 });
      setTimeout(() => {
        field.showGlyph(
          sgn === 'fack2' ? 'WOW\nRUDE' : sgn === 'fack' ? 'F@CK\nYOU'
            : sgn === 'heart' ? '♥' : sgn === 'like' ? '👍' : 'PEACE');
        field.pulse(0.05);                // a whisper-strength stylistic twist
        if (app.state === 'present') {
          field.setTargets({ coherence: CONFIG.coherence.present });
        }
      }, 420);
    }
    if (app.recOn && h) {
      // wrist rides along (v25.3): the palm CENTROID is 4/5 knuckles and
      // follows the fingers — the wrist is the one point that doesn't;
      // the anchor experiment reads on these two columns
      app.rec.push(`${(performance.now() / 1000).toFixed(2)} ${h.pinch.toFixed(2)} ${h.open.toFixed(2)} ${h.size.toFixed(3)} ${h.palm.x.toFixed(3)} ${h.palm.y.toFixed(3)} ${h.index.x.toFixed(3)} ${h.index.y.toFixed(3)} ${h.wrist ? `${h.wrist.x.toFixed(3)} ${h.wrist.y.toFixed(3)}` : '- -'}`);
      if (app.rec.length > 1400) app.rec.shift();
    }
    if (app.grecOn && e.detail.hands.length) {
      // the fat trace: full 21-point skeletons of EVERY hand in frame —
      // the ghost teacher is drawn from these clips. All hands by design
      // (the owner's own caution against a truncated format: record one
      // hand by keeping one hand in frame, not by a format that can't
      // hold two). ~45s cap keeps the clipboard sane.
      app.grec.push({
        t: +(performance.now() / 1000).toFixed(3),
        hands: e.detail.hands.filter((hh) => hh?.raw).map((hh) =>
          hh.raw.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +(p.z || 0).toFixed(4)])),
      });
      if (app.grec.length > 900) app.grec.shift();
      // the hand's neighborhood, for the depth stream (pad in cam units)
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const hh of e.detail.hands) {
        if (!hh?.raw) continue;
        for (const p of hh.raw) {
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
          y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
      }
      app._grecBox = x1 > x0
        ? { x0: x0 - 0.05, x1: x1 + 0.05, y0: y0 - 0.05, y1: y1 + 0.05 }
        : null;
    }
  });

  const gctx = () => app.lb ? 'lightbox' : app.spaceId ? 'chapter:' + app.spaceId : app.state;
  const jline = (line) => {
    app.glog.push(line);
    if (app.glog.length > 6) app.glog.shift();
    app.glogFull.push(line);
    if (app.glogFull.length > 500) app.glogFull.shift();
  };
  for (const ev of ['enter', 'leave', 'grabstart', 'grabend', 'tap', 'swipe', 'flick', 'spreadstart', 'spreadend', 'clench', 'unclench']) {
    gestures.addEventListener(ev, (e) => {
      const h = gestures.hand;
      jline(`${(performance.now() / 1000).toFixed(1)}s ${ev}` +
        `${e.detail?.dir ? ' ' + e.detail.dir : ''}` +
        `${h ? `  pinch ${h.pinch.toFixed(2)} size ${h.size.toFixed(2)}` : ''}` +
        `${e.detail?.info ? `  ${e.detail.info}` : ''}` +
        `  [${gctx()}]`);
    });
  }
  // the journal of refusals: near-misses and dead acts, each named after the
  // gate that said no — the field loop was blind to failed attempts before
  gestures.addEventListener('note', (e) => {
    jline(`${(performance.now() / 1000).toFixed(1)}s ${e.detail.tag}` +
      `${e.detail.info ? ' ' + e.detail.info : ''}  [${gctx()}]`);
  });

  gestures.addEventListener('enter', () => document.body.classList.add('hand-on'));
  gestures.addEventListener('leave', () => {
    document.body.classList.remove('hand-on');
    app.hold.p = 0;
    app.drag = null;
  });
  gestures.addEventListener('grabstart', (e) => onGrabStart(e.detail));
  gestures.addEventListener('grabmove', (e) => onGrabMove(e.detail));
  gestures.addEventListener('grabend', (e) => onGrabEnd(e.detail));
  gestures.addEventListener('tap', (e) => onAirTap(e.detail));
  gestures.addEventListener('swipe', (e) => onSwipe(e.detail));
  gestures.addEventListener('flick', (e) => onFlick(e.detail));
  gestures.addEventListener('spreadstart', () => onSpreadStart());
  gestures.addEventListener('spreadmove', (e) => onSpreadMove(e.detail));
  gestures.addEventListener('spreadend', (e) => onSpreadEnd(e.detail));
  gestures.addEventListener('clench', (e) => onClench(e.detail));
  gestures.addEventListener('unclench', () => onUnclench());
  gestures.addEventListener('fistmove', (e) => onFistMove(e.detail));
  gestures.addEventListener('fistend', () => onFistEnd());
  for (const ev of ['enter', 'grabstart', 'tap', 'swipe', 'spreadstart', 'clench', 'unclench'])
    gestures.addEventListener(ev, () => { app.lastActivity = performance.now(); });

  // capability gate: without WebGPU the depth net runs on CPU and MediaPipe
  // falls to the main thread — a slideshow that hurts more than absence.
  // Such browsers get the QUIET MOUSE MODE (restored 09.07 — a Cycle-C
  // commit had flattened it into a dead-end while the README, the CSS and
  // the render loop still promised it): the mirror sleeps, the portfolio
  // stays fully open — nodes click, chapters read, wheel scrolls. A calm
  // explanation floats at the centre with a "wake it here" button; models
  // are not downloaded until that click.
  (async () => {
    let capable = false;
    try { capable = !!(navigator.gpu && await navigator.gpu.requestAdapter()); }
    catch (_) { capable = false; }
    if (capable) {
      engine.initWorker();
    } else {
      app.state = 'asleep';
      hide('invite');
      show('asleep');
      $('asleep').classList.add('quiet');
      revealNodes();
    }
  })();

  $('space-close').addEventListener('click', () => closeSpace());

  $('ghint-t').addEventListener('click', () => {
    const c = app.ghintCtx;
    if (!c) return;
    const cur = app.ghintOpen[c] ??
      (c === 'present' && !localStorage.getItem('gl_open'));
    app.ghintOpen[c] = !cur;
    syncGhint();
  });

  $('asleep-action').addEventListener('click', () => {
    hide('asleep');
    $('asleep').classList.remove('quiet');
    show('invite');
    app.state = 'boot';
    engine.initWorker();
  });

  // -- chrome events
  $('invite-action').addEventListener('click', requestCamera);
  $('denied-action').addEventListener('click', requestCamera);

  window.addEventListener('resize', () => { field.resize(); positionCloseCross(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (app.lb) closeLightbox(); else closeSpace(); }
    if (app.lb && e.key === 'ArrowRight') lightboxStep(1);
    if (app.lb && e.key === 'ArrowLeft') lightboxStep(-1);
    if (e.code === 'KeyD' && (e.altKey || e.ctrlKey)) cycleDebug();
    if (e.code === 'KeyC' && e.altKey) copyLog();
    if (e.code === 'KeyR' && e.altKey) toggleRec();
    if (e.code === 'KeyG' && e.altKey) toggleGRec();
    if (e.code === 'KeyT' && e.altKey) copyRec();
  });
  document.addEventListener('click', (e) => {
    if (app.lb) {
      const r = $('lb-img').getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right ||
          e.clientY < r.top || e.clientY > r.bottom) closeLightbox();
      else lightboxStep(e.clientX > r.left + r.width / 2 ? 1 : -1);
      return;
    }
    const fig = e.target.closest('#space-inner figure');
    if (fig) { openLightbox(fig); return; }
    if (app.spaceId && !e.target.closest('#space-inner') &&
        !e.target.closest('.node') && !e.target.closest('#lang') &&
        !e.target.closest('#ghint')) {
      closeSpace();
    }
  });

  // silent mouse/wheel fallbacks — never advertised, always working
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('mousedown', onMouseDown);
  // the mouse betrays a hands-down visitor — the ghost answers it
  window.addEventListener('mousemove', (e) => {
    app.mouseAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });

  requestAnimationFrame(loop);
}

async function requestCamera() {
  hide('denied');
  try {
    await app.engine.startCamera();
    // permission revoked or the device seized mid-session: the stream says
    // 'ended' — return to the invitation honestly instead of watching a
    // dead feed with a frozen hand and a lying telemetry line
    app.engine.stream?.getVideoTracks?.()[0]?.addEventListener('ended', () => {
      app.engine.running = false;
      app.cameraOn = false;
      document.body.classList.remove('camera-on', 'hand-on');
      closeLightbox();
      closeSpace();
      enterDenied();
    });
    app.cameraOn = true;
    hide('invite');
    app.state = 'watching';
    app.field.setTargets({ coherence: CONFIG.coherence.watching });
    document.body.classList.add('camera-on');
    if (!isZero) app.hands.init(app.engine.video);
    app.pose.init(app.engine.video);
    app.pose.start();                 // runs while watching too — it IS the doorman
  } catch (_) {
    enterDenied();
  }
}

function enterDenied() {
  app.state = 'denied';
  hide('invite');
  show('denied');
  app.field.setTargets({ coherence: 0 });
}

function enterFailed() {
  if (app.state === 'failed') return;
  app.state = 'failed';
  hide('invite'); hide('denied');
  show('failed');
}

function enterPresent() {
  if (app.state === 'failed') return;
  app.state = 'present';
  app.presentSince = performance.now();
  app.field.setTargets({ coherence: CONFIG.coherence.present });
  if (!isZero) app.hands.start();
  applyCadence();
  syncGhint();
  setTimeout(() => {
    if (app.state === 'present') document.body.classList.add('named');
  }, CONFIG.reveal.nameMs);
}

function leavePresent() {
  setTimeout(syncGhint, 0);   // after the state settles below
  app.field.triggerExhale();                 // the imprint breathes out
  app.state = 'watching';
  app.nodesShown = false;
  app.field.setTargets({ coherence: CONFIG.coherence.watching });
  document.body.classList.remove('named', 'nodes-on', 'hand-on');
  closeSpace();
  if (!isZero) app.hands.stop();
  applyCadence();
  for (const el of document.querySelectorAll('.node')) el.classList.remove('shown', 'focus');
  app.focusedId = null;
}

function applyCadence() {
  if (!app.engine) return;   // mobile: no pipeline to pace
  const present = app.signals?.present;
  const open = !!app.spaceId;
  app.engine.setCadence(present
    ? (open ? CONFIG.cadence.depthReading : CONFIG.cadence.depthPresent)
    : CONFIG.cadence.depthIdle);
  app.hands.setCadence(present ? CONFIG.cadence.handsPresent : CONFIG.cadence.handsIdle);
  app.pose.setCadence(present ? CONFIG.cadence.posePresent : CONFIG.cadence.poseIdle);
}

// ---------------------------------------------------------------- nodes

function buildNodes() {
  const wrap = $('nodes');
  wrap.innerHTML = '';
  for (const n of NODES) {
    const el = document.createElement('button');
    el.className = 'node';
    el.dataset.id = n.id;
    el.innerHTML = `<span class="n-label"></span><i class="n-bar"><i class="n-fill"></i></i><span class="n-sub"></span>`;
    el.addEventListener('click', () => openSpace(n.id));
    wrap.appendChild(el);
  }
  localizeNodes();
}

function localizeNodes() {
  for (const n of NODES) {
    const el = document.querySelector(`.node[data-id="${n.id}"]`);
    if (!el) continue;
    el.querySelector('.n-label').textContent = n.label[lang];
    el.querySelector('.n-sub').textContent = n.sub[lang];
  }
}

function revealNodes() {
  app.nodesShown = true;
  document.body.classList.add('nodes-on');
  document.querySelectorAll('.node').forEach((el, i) => {
    setTimeout(() => { if (app.nodesShown) el.classList.add('shown'); }, i * CONFIG.reveal.stagger);
  });
}

// ---------------------------------------------------------------- content space

function openSpace(id) {
  const node = NODES.find((n) => n.id === id);
  if (!node || app.spaceId === id) return;
  app.spaceId = id;
  if (app.signals) {
    app.signals.panelOpen = true;
    app.signals.openBaseline = app.signals.baseline;
  }
  app.hold.p = 0;
  app.hold.until = performance.now() + 1200;

  document.body.classList.toggle('space-right', (node.pose?.x ?? 1) < 0);
  // sideways flicks exist only where something moves sideways — on strip-less
  // right chapters a diagonal snap must fall through to the vertical reading
  if (app.gestures) app.gestures.flickXEnabled = (node.pose?.x ?? 1) >= 0;
  syncPalmVocab();
  renderSpaceContent(node);
  app.scroll.y = 0; app.scroll.target = 0; app.scroll.vel = 0; app.scroll.over = 0;
  app.pageX = 0; app.pageXVel = 0;
  $('space-inner').style.transform = 'translateY(0px)';

  document.body.classList.add('space-open');
  app.field?.setPose(node.pose || { x: 0.46, rotY: -0.5, scale: 0.9, dim: 0 });
  applyCadence();
  syncGhint();
}

// the cross sits beside the REAL first line of the title — measured, not
// guessed: every chapter's title has its own length
// Y rides the title's first line; X lives in the stylesheet — outside the
// column width (anchoring X to the line's text end put the cross inside
// short headings)
// The cross is re-parented into the scrolling sheet on every render:
// innerHTML wipes children, so it steps out, waits, and steps back in.
function renderSpaceContent(node) {
  const bt = $('space-bar-t');
  if (bt) bt.textContent = node.label[lang];   // the mobile modal bar
  const inner = $('space-inner');
  const sc = $('space-close');
  $('space').appendChild(sc);                 // step out before the wipe
  inner.innerHTML = renderPanel(node, lang);
  // on mobile the cross lives in the fixed bar: the sheet's will-change
  // turns any "fixed" child into its passenger (it scrolled away — WTF
  // of 09.07); on desktop it rides the sheet by design
  if (!isMobile) inner.appendChild(sc);
  collectStrips();
  requestAnimationFrame(() => requestAnimationFrame(positionCloseCross));
}

// Y — the title's first-line axis; X — beyond the column width, both
// measured relative to the sheet the cross now lives in
function positionCloseCross() {
  if (isMobile) return;   // pinned in the modal bar by CSS
  const sc = $('space-close');
  const h2 = document.querySelector('#space-inner h2');
  if (!sc || !h2 || !app.spaceId) return;
  const fs = parseFloat(getComputedStyle(h2).fontSize);
  const lineH = parseFloat(getComputedStyle(h2).lineHeight) || fs * 1.08;
  const cross = Math.round(fs * 0.82);
  sc.style.setProperty('--cross', `${cross}px`);
  sc.style.top = `${h2.offsetTop + (lineH - cross) / 2}px`;
  if (document.body.classList.contains('space-right')) {
    sc.style.left = `${h2.offsetLeft - 42 - cross}px`;
  } else {
    sc.style.left = `${h2.offsetLeft + h2.offsetWidth + 42}px`;
  }
}

function closeSpace() {
  if (!app.spaceId) return;
  app.spaceId = null;
  // the lesson's stage is the chapter — no chapter, no lesson
  if (app.teacher?.playing) app.teacher.stop();
  if (app.signals) {
    app.signals.panelOpen = false;
    app.signals.lastLeanEnd = performance.now();
  }
  app.hold.until = performance.now() + 900;
  app.strips = [];
  app.drag = null;
  if (app.gestures) app.gestures.flickXEnabled = false;
  closeLightbox();
  syncPalmVocab();
  document.body.classList.remove('space-open');
  app.field?.setPose(null);
  applyCadence();
  syncGhint();
}

function collectStrips() {
  app.strips = [...document.querySelectorAll('#space-inner .strip')].map((el) => ({
    el,
    track: el.querySelector('.strip-track'),
    x: 0, vel: 0,
  }));
}

function stripBounds(s) {
  const visible = s.el.clientWidth;
  const total = s.track.scrollWidth;
  return { min: Math.min(0, visible - total), max: 0 };
}

// ---------------------------------------------------------------- gesture drags

function hitStrip(x, y) {
  for (const s of app.strips) {
    const r = s.el.getBoundingClientRect();
    if (y > r.top - 30 && y < r.bottom + 30 && x > r.left - 60) return s;
  }
  return null;
}

function onGrabStart({ x, y }) {
  if (app.lb) {
    // axis lock inside the lightbox too: ⟷ walks the photos, ↕ carries
    // the photo away (release far → it closes, like tossing it down)
    app.drag = { kind: 'lb-pending', accX: 0, accY: 0 };
  } else if (app.spaceId) {
    // free drag (Dmitry's model): no axis lock — the vertical component
    // always scrolls the chapter, the horizontal one moves the strip
    // under the hand, both live at once
    const s = hitStrip(x, y);
    if (s) { s.vel = 0; s.el.classList.add('dragging'); }
    app.drag = { kind: 'chapter', strip: s };
    document.body.classList.add('gripping');   // instant "you've got it"
  }
  // grabbing on the main screen deliberately does nothing:
  // the mirror is a mirror, not a knob
}

function onGrabMove({ dx, dy }) {
  let d = app.drag;
  if (!d) return;
  if (d.kind === 'chapter') {
    // dominance weighting: the stronger component wins softly, so a vertical
    // pull doesn't wiggle the strip and a strip drag doesn't rock the text
    const tot = Math.abs(dx) + Math.abs(dy) + 1e-3;
    const wy = clamp((Math.abs(dy) / tot) * 1.7, 0, 1);
    const wx = clamp((Math.abs(dx) / tot) * 1.7, 0, 1);

    const step = (Math.abs(dy) < 1.5 ? 0 : clamp(dy, -90, 90)) * wy;
    d.flt = (d.flt ?? 0) * 0.35 + step * 0.65;
    const was = app.scroll.target;
    const raw = app.scroll.target - d.flt;
    app.scroll.target = clamp(raw, 0, app.scroll.max);
    app.teachScrolled?.(app.scroll.target - was);
    // rubber band: pulling past an edge visibly carries the content with
    // resistance — the page is in your hand even when there's no more of it
    const beyond = raw < 0 ? raw : raw > app.scroll.max ? raw - app.scroll.max : 0;
    if (beyond) app.scroll.over = clamp(app.scroll.over - beyond * 0.45, -110, 110);
    app.scroll.vel = 0;
    if (d.strip && wx > 0.2) moveStrip(d.strip, dx * wx);
    return;
  }
  if (d.kind === 'lb-pending') {
    d.accX += dx; d.accY += dy;
    if (Math.hypot(d.accX, d.accY) < 12) return;
    if (app.lb && app.lb.zoom > 1.05) {
      d = app.drag = { kind: 'lb-pan' };
    } else {
      d = app.drag = Math.abs(d.accX) > Math.abs(d.accY)
        ? { kind: 'lightbox', acc: d.accX }
        : { kind: 'lb-toss', acc: d.accY };
    }
  }
  if (d.kind === 'lb-pan') {
    if (app.lb) { app.lb.panX += dx; app.lb.panY += dy; applyLbTransform(); }
    return;
  }
  if (d.kind === 'lightbox') {
    d.acc += dx;
    $('lb-img').style.transform = `translateX(${d.acc * 0.35}px)`;
    if (Math.abs(d.acc) > 150) {
      lightboxStep(d.acc < 0 ? 1 : -1);
      d.acc = 0;
    }
  } else if (d.kind === 'lb-toss') {
    d.acc += dy;
    const k = clamp(Math.abs(d.acc) / 260, 0, 1);
    $('lb-img').style.transform = `translateY(${d.acc * 0.5}px) scale(${1 - k * 0.06})`;
    $('lb-img').style.opacity = String(1 - k * 0.35);
  }
}

function onGrabEnd({ vx, vy }) {
  const d = app.drag;
  if (!d) return;
  if (d.kind === 'lightbox' || d.kind === 'lb-pending') {
    $('lb-img').style.transform = '';
  } else if (d.kind === 'lb-toss') {
    const img = $('lb-img');
    img.style.transform = '';
    img.style.opacity = '';
    if (Math.abs(d.acc) > 170 || Math.abs(vy) > 900) closeLightbox();
  } else if (d.kind === 'chapter') {
    app.scroll.vel = -vy;
    if (d.strip) {
      d.strip.vel = vx;
      d.strip.el.classList.remove('dragging');
    }
    document.body.classList.remove('gripping');
  }
  app.drag = null;
}

// two hands apart = zoom. In the photo it zooms live; in a chapter a wide
// spread lifts the nearest photo to full screen (Dmitry's idea #1)
function onSpreadStart() {
  cancelDrag();
  if (app.lb) app.lb.zoom0 = app.lb.zoom;
}

function onSpreadMove({ scale }) {
  if (!app.lb) return;
  app.lb.zoom = clamp((app.lb.zoom0 || 1) * scale, 1, 2.6);
  if (app.lb.zoom <= 1.02) { app.lb.zoom = 1; app.lb.panX = 0; app.lb.panY = 0; }
  applyLbTransform();
  syncCalm();
}

// the zoomed state's vocabulary shrinks to fist/pinch/spread/open palm —
// at the DETECTION level: a silenced swipe still poisons cooldowns
// the gesture hint (owner's spec): a toggle above, a terse amber list of
// what the hands can say HERE. Three contexts: the fork (expanded by
// default, top-right under the language switch), a left chapter (collapsed,
// top-right), a right chapter (collapsed, top-LEFT under dimbo — the
// switch side stays clear of the reading column). Camera-mode only: the
// quiet mouse tiers have no gestures to hint at.
function syncGhint() {
  const g = $('ghint');
  if (!g) return;
  let ctx = null;
  if (app.gestures && app.cameraOn && !app.lb) {
    if (app.spaceId) ctx = document.body.classList.contains('space-right') ? 'right' : 'left';
    else if (app.state === 'present') ctx = 'present';
  }
  if (!ctx) { g.classList.add('hidden'); app.ghintCtx = null; return; }
  app.ghintCtx = ctx;
  // the visitor's toggle is STICKY per screen for the whole session — a
  // lightbox trip or any other gesture must never fold what he opened
  // (owner's hard rule). The ONLY automatic dimming lives on the fork:
  // expanded until the hands succeed once (the same learned flag that
  // retires the node sub-hint), collapsed ever after. Chapters simply
  // start collapsed and then obey the visitor.
  const open = app.ghintOpen[ctx] ??
    (ctx === 'present' && !localStorage.getItem('gl_open'));
  g.classList.remove('hidden');
  g.classList.toggle('left', ctx === 'right');
  g.classList.toggle('open', open);
  $('ghint-t').textContent = `${UI.ghint.t[lang]} ${open ? '\u2212' : '+'}`;
  $('ghint-l').innerHTML = UI.ghint[ctx][lang].map((grp) =>
    (grp.h ? `<li class="gh-h">${grp.h}</li>` : '') +
    grp.items.map(([a, b]) => `<li><b>${a}</b> — ${b}</li>`).join('')
  ).join('');
}

function syncCalm() {
  if (app.gestures) app.gestures.calmActs = !!(app.lb && app.lb.zoom > 1.05);
}

// the same law across screens: each palm/fist act is DETECTABLE only where
// it means something. A dead palm-down inside a chapter used to fire as a
// swipe main ignored — and its cooldowns starved the very next real stroke
// (the "unstable scroll" of the cold test). Present: dwell only.
function syncPalmVocab() {
  const g = app.gestures;
  if (!g) return;             // mobile: no gesture layer
  g.swipeUpEnabled = !app.lb && !!app.spaceId;   // the sheet rides up — read on
  g.swipeDownEnabled = !!app.lb;                 // the palm lets the photo go
  g.clenchEnabled = !!(app.spaceId || app.lb);   // the fist takes / holds
  g.unclenchEnabled = !!app.lb;                  // the open palm releases
}

function onSpreadEnd() { /* zoom applies live; nothing to finalize */ }

function nearestFigure(x, y) {
  let best = null, bd = Infinity;
  for (const f of currentStripItems()) {
    const r = f.getBoundingClientRect();
    if (r.width === 0) continue;
    const d = Math.abs(r.left + r.width / 2 - x) + Math.abs(r.top + r.height / 2 - y) * 0.6;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// palm clenched into a fist: take the photo — it fills the screen.
// fist opened back into a palm: release it — the photo returns.
function onClench({ x, y }) {
  cancelDrag();
  if (app.lb || !app.spaceId) return;
  const f = nearestFigure(x, y);
  if (f) openLightbox(f);
}

function onUnclench() {
  cancelDrag();
  if (!app.lb) return;
  // layered release (Dmitry's design): zoomed, the open palm lets go of the
  // ZOOM first — the photo returns whole, position not preserved on purpose
  // (predictability beats saved state; spreading again is one gesture).
  // Unzoomed, it releases the photo itself.
  if (app.lb.zoom > 1.05) {
    app.lb.zoom = 1; app.lb.panX = 0; app.lb.panY = 0;
    applyLbTransform();
    syncCalm();
    return;
  }
  closeLightbox();
}

// the held fist carries what the clench took (Dmitry's lightbox layer):
// unzoomed it rifles through the stack — the photos slide under the fist,
// the same continuous motion that opened one; zoomed it drags the frame
function onFistMove({ dx, dy }) {
  if (!app.lb) return;
  if (app.lb.zoom > 1.05) {
    app.lb.panX += dx; app.lb.panY += dy;
    applyLbTransform();
    return;
  }
  const f = app.fist || (app.fist = { acc: 0 });
  f.acc += dx;
  $('lb-img').style.transform = `translateX(${f.acc * 0.35}px)`;
  if (Math.abs(f.acc) > 150) {
    lightboxStep(f.acc < 0 ? 1 : -1);
    f.acc = 0;
    $('lb-img').style.transform = '';
  }
}

function onFistEnd() {
  app.fist = null;
  if (app.lb && app.lb.zoom <= 1.05) $('lb-img').style.transform = '';
}

function cancelDrag() {
  document.body.classList.remove('gripping');
  const d = app.drag;
  if (!d) return;
  if (d.kind === 'chapter' && d.strip) d.strip.el.classList.remove('dragging');
  if (d.kind === 'lightbox' || d.kind === 'lb-toss') {
    $('lb-img').style.transform = '';
    $('lb-img').style.opacity = '';
  }
  app.drag = null;
}

// open-palm fling ⟷ flips; open-palm brush ↓ closes the current layer
function onSwipe({ axis, dir, vx, pure }) {
  // the zoomed photo is its own state (Dmitry's model): two hands rule the
  // scale, the fist or pinch carries the frame, the open palm resets —
  // flipping photos while zoomed-in is never what the moving hands mean
  if (app.lb && app.lb.zoom > 1.05) return;
  if (axis === 'y') {
    if (app.lb) { if (dir === 'down') closeLightbox(); return; }
    if (!app.spaceId) return;
    // the family split is LAW (Dmitry caught its violations twice, both
    // before the field did): the palm owns exactly ONE direction — onward.
    // Palm-down in a chapter means nothing at any speed: it is either the
    // palm coming home or an unclear wish, and neither may move the page.
    // Back = the finger snap or the pinch; home = a couple of pinch-flings.
    if (dir === 'up') {
      app.scroll.target = clamp(app.scroll.target + window.innerHeight * 0.6, 0, app.scroll.max);
    }
    return;
  }
  if (app.lb) { lightboxStep(dir === 'left' ? 1 : -1); return; }
  if (app.spaceId && app.gestures.active) {
    // sideways-close for right chapters was tried and field-rejected: it
    // fired one attempt in four ("случайность, а не правило") — closing
    // lives on the cross, Esc, the click-out and walking away
    const s = hitStrip(app.gestures.cursor.x, app.gestures.cursor.y);
    if (s) s.vel = vx * 0.9;
  }
}

// lazy finger flicks. Vertical scrolling is Dmitry's split, two families
// under one sheet metaphor: the open PALM sweeps the sheet up (read on,
// lives in onSwipe), the parked-palm FINGER snaps the sheet down (one step
// back, here). Each family is blind to the other's wind-ups and returns —
// that's what makes two directions possible without a clutch. Upward finger
// motion remains a non-gesture. Horizontal keeps both directions
// (galleries need them) under the reading-direction momentum.
function onFlick({ axis, dir, vel }) {
  let moved = false;
  if (axis === 'y') {
    if (!app.lb && app.spaceId) {
      const step = window.innerHeight * 0.52;
      if (app.scroll.target <= 4) app.scroll.over = 70;   // nothing above
      app.scroll.target = clamp(app.scroll.target - step, 0, app.scroll.max);
      app.scroll.vel = 0;
    }
    return;
  }
  if (app.lb) {
    if (app.lb.zoom > 1.05) return;     // zoomed: the frame is held, not flipped
    lightboxStep(dir === 'left' ? 1 : -1);
    app.gestures.noteFlickEffect('x', true);
    return;
  }
  if (app.spaceId && !document.body.classList.contains('space-right')) {
    // the sweep usually ends far from where the strip is — aim by height
    const c = app.gestures.cursor;
    const s = hitStrip(c.x, c.y) || nearestStrip(c.y);
    if (s) {
      s.vel = (dir === 'right' ? 1 : -1) * clamp(Math.abs(vel) * 0.85, 900, 2600);
      moved = true;
    }
  }
  app.gestures.noteFlickEffect('x', moved);
}

function nearestStrip(y) {
  let best = null, bd = Infinity;
  for (const s of app.strips) {
    const r = s.el.getBoundingClientRect();
    if (!r.height) continue;
    const d = Math.abs(r.top + r.height / 2 - y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// air-tap: a quick pinch acts like a click at the cursor
function onAirTap({ x, y }) {
  cancelDrag();
  if (app.lb) {
    if (app.lb.zoom > 1.05) return;
    const r = $('lb-img').getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) closeLightbox();
    else lightboxStep(x > r.left + r.width / 2 ? 1 : -1);
    return;
  }
  if (app.spaceId) {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('#space-close')) { closeSpace(); return; }
    const fig = el?.closest('#space-inner figure');
    if (fig) { openLightbox(fig); return; }
    const link = el?.closest('#space-inner a');
    if (link) {
      // taking the mouse returns you to the ordinary web — except the résumé
      if (link.dataset.dl !== undefined) {
        link.click();
        link.classList.add('dl-got');
        setTimeout(() => link.classList.remove('dl-got'), 1600);
      }
      return;
    }
    return;
  }
  if (app.state === 'present' && app.focusedId &&
      performance.now() > app.glyphUntil) openSpace(app.focusedId);
}

// ---------------------------------------------------------------- lightbox

function currentStripItems() {
  return [...document.querySelectorAll('#space-inner .strip figure')];
}

function openLightbox(fig) {
  if (performance.now() < app.lbCooldownUntil) return;
  const figures = currentStripItems();
  const idx = figures.indexOf(fig);
  if (idx < 0) return;
  app.lb = {
    items: figures.map((f) => ({
      src: f.querySelector('img').src,
      cap: f.querySelector('figcaption')?.textContent || '',
      el: f,
    })),
    idx,
    zoom: 1, panX: 0, panY: 0,
  };
  renderLightbox();
  document.body.classList.add('lb-open');
  // a photo opened, by any means — the photo lesson is learned
  app.teachLearned?.('photo');
  if (app.gestures) {
    app.gestures.spreadEnabled = true;
    app.gestures.flickXEnabled = true;  // sideways flicks walk the photos
  }
  syncPalmVocab();
  syncGhint();
  flipFrom(fig);
}

// FLIP: the photo grows out of its place in the strip, not out of nowhere
function flipFrom(fig) {
  const thumb = fig.querySelector('img').getBoundingClientRect();
  const img = $('lb-img');
  requestAnimationFrame(() => {
    const fr = img.getBoundingClientRect();
    if (!fr.width || !thumb.width) return;
    const dx = (thumb.left + thumb.width / 2) - (fr.left + fr.width / 2);
    const dy = (thumb.top + thumb.height / 2) - (fr.top + fr.height / 2);
    const s = thumb.width / fr.width;
    img.classList.remove('lb-anim');
    img.style.transition = 'none';
    img.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
    void img.offsetWidth;
    img.style.transition = 'transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)';
    img.style.transform = '';
    setTimeout(() => { img.style.transition = ''; }, 700);
  });
}

// step past the last photo → the chapter takes you back (reversible exit)
// flipping never closes: at the edges the photo springs — a clear "no more"
function lightboxStep(delta) {
  if (!app.lb) return;
  if (app.lb.zoom > 1.05) return;                  // zoomed in: dragging pans
  const next = app.lb.idx + delta;
  if (next >= app.lb.items.length || next < 0) {
    const img = $('lb-img');
    img.classList.remove('lb-nudge-l', 'lb-nudge-r');
    void img.offsetWidth;
    img.classList.add(delta > 0 ? 'lb-nudge-r' : 'lb-nudge-l');
    return;
  }
  app.lb.idx = next;
  app.lb.zoom = 1; app.lb.panX = 0; app.lb.panY = 0;
  applyLbTransform();
  renderLightbox(delta);
}

function applyLbTransform() {
  const lb = app.lb;
  if (!lb) return;
  const img = $('lb-img');
  const r = img.getBoundingClientRect();
  const mx = (r.width / (lb.zoom || 1)) * (lb.zoom - 1) / 2;
  const my = (r.height / (lb.zoom || 1)) * (lb.zoom - 1) / 2;
  lb.panX = clamp(lb.panX, -mx, mx);
  lb.panY = clamp(lb.panY, -my, my);
  img.style.transform = lb.zoom > 1
    ? `translate(${lb.panX}px, ${lb.panY}px) scale(${lb.zoom})` : '';
}

function renderLightbox(dir) {
  const { items, idx } = app.lb;
  const img = $('lb-img');
  if (dir) {
    // directional handover: the old frame drifts out, the new one drifts in
    const ghost = img.cloneNode();
    ghost.id = '';
    ghost.className = 'lb-ghost';
    const fr = img.getBoundingClientRect();
    const pr = img.parentElement.getBoundingClientRect();
    ghost.style.left = `${fr.left - pr.left}px`;
    ghost.style.top = `${fr.top - pr.top}px`;
    ghost.style.width = `${fr.width}px`;
    ghost.style.height = `${fr.height}px`;
    img.parentElement.appendChild(ghost);
    requestAnimationFrame(() => {
      ghost.style.transform = `translateX(${dir * -90}px) scale(0.965)`;
      ghost.style.opacity = '0';
    });
    setTimeout(() => ghost.remove(), 600);
    img.classList.remove('lb-anim', 'lb-from-l', 'lb-from-r');
    void img.offsetWidth;
    img.src = items[idx].src;
    img.classList.add(dir > 0 ? 'lb-from-r' : 'lb-from-l');
  } else {
    img.classList.remove('lb-anim', 'lb-from-l', 'lb-from-r');
    void img.offsetWidth;
    img.src = items[idx].src;
    img.classList.add('lb-anim');
  }
  if (app.lb.zoom <= 1) img.style.transform = '';
  $('lb-cap').textContent = items[idx].cap;
  $('lb-count').textContent = `${idx + 1} / ${items.length}`;
}

function closeLightbox() {
  if (!app.lb) return;
  // reverse FLIP: the photo returns to its slot in the strip
  const item = app.lb.items[app.lb.idx];
  const img = $('lb-img');
  const thumbImg = item?.el?.querySelector('img');
  if (thumbImg && document.body.contains(thumbImg)) {
    const thumb = thumbImg.getBoundingClientRect();
    const fr = img.getBoundingClientRect();
    if (fr.width && thumb.width) {
      const dx = (thumb.left + thumb.width / 2) - (fr.left + fr.width / 2);
      const dy = (thumb.top + thumb.height / 2) - (fr.top + fr.height / 2);
      const s = thumb.width / fr.width;
      img.classList.remove('lb-anim', 'lb-from-l', 'lb-from-r');
      img.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
      img.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
      setTimeout(() => { img.style.transition = ''; img.style.transform = ''; }, 520);
    }
  }
  app.lb = null;
  app.fist = null;
  app.lbCooldownUntil = performance.now() + 800;
  if (app.gestures) {
    app.gestures.spreadEnabled = false;
    app.gestures.calmActs = false;
    // back to the chapter's own rule: sideways flicks only where strips live
    app.gestures.flickXEnabled =
      !!app.spaceId && !document.body.classList.contains('space-right');
  }
  syncPalmVocab();
  syncGhint();
  document.body.classList.remove('lb-open');
}

function moveStrip(s, dx) {
  const { min, max } = stripBounds(s);
  let x = s.x + dx;
  if (x > max) x = max + (x - max) * 0.25;        // rubber band
  if (x < min) x = min + (x - min) * 0.25;
  s.x = x;
}

// mouse fallbacks: drag a strip, wheel to scroll — silent, undocumented
function onMouseDown(e) {
  if (!app.spaceId) return;
  const s = hitStrip(e.clientX, e.clientY);
  if (!s || e.target.closest('a')) return;
  e.preventDefault();
  s.el.classList.add('dragging');
  let lastX = e.clientX, moved = 0;
  const mm = (ev) => {
    moveStrip(s, ev.clientX - lastX);
    moved += Math.abs(ev.clientX - lastX);
    lastX = ev.clientX;
  };
  const mu = () => {
    s.el.classList.remove('dragging');
    window.removeEventListener('mousemove', mm);
    window.removeEventListener('mouseup', mu);
  };
  window.addEventListener('mousemove', mm);
  window.addEventListener('mouseup', mu);
}

function onWheel(e) {
  if (app.lb) {
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) > 24) lightboxStep(d > 0 ? 1 : -1);
    return;
  }
  if (!app.spaceId) return;
  e.preventDefault();
  const s = hitStrip(e.clientX, e.clientY);
  if (s && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    moveStrip(s, -e.deltaX);
  } else {
    app.scroll.target = clamp(app.scroll.target + e.deltaY, 0, app.scroll.max);
  }
}

// ---------------------------------------------------------------- render loop

let lastT = performance.now();
let lastTele = 0;
let fpsE = 60;
let frameNo = 0;

function loop(t) {
  try {
    loopBody(t);
  } catch (err) {
    app.glog.push('ERR ' + (err?.message || err));
    if (app.glog.length > 6) app.glog.shift();
  }
  requestAnimationFrame(loop);
}

function loopBody(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  frameNo++;
  fpsE = fpsE * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;

  const { field, signals, gestures } = app;

  // low-power mode: nobody in front → render at half rate
  const lowPower = app.state !== 'present';
  if (!(lowPower && frameNo % 2)) {

    if (app.state === 'present') {
      const handActive = gestures.active;
      app.pointer = handActive ? reflectionPointer() : null;
      // the scene does not turn. period — stability beat liveliness
      const headX = clamp((signals.cx - 0.5) * 2 * CONFIG.focus.gain, -1.6, 1.6);
      // the words are independent of the 3D form — the ONE thing the camera
      // always reads (a lean) may move them a little. The form itself never
      // turns; this parallax lives only while the glyph holds the stage.
      const glyphOn = t < app.glyphUntil;
      field.setGlyphParallax(
        glyphOn ? clamp(-headX * 0.9, -1.2, 1.2) : 0,
        glyphOn ? clamp((0.5 - signals.cy) * 0.7, -0.8, 0.8) : 0,
        glyphOn ? 1 : 0);
      const nodesDelay = returning ? CONFIG.reveal.nodesMs * 0.45 : CONFIG.reveal.nodesMs;
      if (!isZero && !app.nodesShown && t - app.presentSince > nodesDelay) revealNodes();
      if (app.nodesShown && !app.spaceId) updateNodes(headX, handActive);
    } else if (app.state === 'asleep' && app.nodesShown) {
      updateNodes(0, false, false);
    }

    field.frame(dt * (lowPower ? 2 : 1));
  }

  updateHold(dt, t);
  updateCursor();
  updateSpacePhysics(dt);
  updateGhostHand(t);
  updateFieldTouch();
  updateIdlePulse(t);

  if (t - lastTele > 500) { lastTele = t; renderTelemetry(); renderDebug(); }
}

// The pointer IS the visitor's reflection: the tracked fingertip mapped
// onto the mirror plane and projected with the same matrix as the labels —
// so what you see touching a label is literally your own hand of dots.
function reflectionPointer() {
  const g = app.gestures;
  const h = g.hand;
  if (!h) return null;
  const tip = g.grabbing ? h.pinchPoint : {
    x: h.index.x * 0.55 + h.palm.x * 0.45,
    y: h.index.y * 0.55 + h.palm.y * 0.45,
  };
  let z = 1.2;
  const ld = app.lastDepth;
  if (ld) {
    const ix = clamp(Math.round(tip.x * ld.width), 1, ld.width - 2);
    const iy = clamp(Math.round(tip.y * ld.height), 1, ld.height - 2);
    let m = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        m = Math.max(m, ld.data[(iy + dy) * ld.width + (ix + dx)]);
    z = (m / 255) * CONFIG.depthAmp;
  }
  const local = app.field.frameToLocal(tip.x, tip.y, z);
  const p = app.field.projectPoint(local.x, local.y, local.z);
  return p.behind ? null : { x: p.x, y: p.y, local };
}

function updateNodes(focusX, handActive, focusable = true) {
  const pt = handActive && app.pointer ? app.pointer : null;
  const cursorPx = pt ? pt.x
    : window.innerWidth * (0.5 + 0.5 * clamp(focusX, -1, 1) * 0.8);
  const cursorPy = pt ? pt.y
    : window.innerHeight * clamp(app.signals.cy * 1.5 - 0.2, 0.08, 0.92);

  let best = null, bestDist = CONFIG.focus.maxDistPx;

  for (const n of NODES) {
    const el = document.querySelector(`.node[data-id="${n.id}"]`);
    const p = app.field.projectAnchor(n.id);
    if (!el || !p) continue;
    if (p.behind) { el.style.opacity = 0; continue; }
    const par = -focusX * 13 * (n.anchor.z / 3.4);
    const x = p.x + par;
    el.style.transform =
      `translate(-50%, -50%) translate3d(${x}px, ${p.y}px, 0) scale(${p.scale})`;
    el.style.opacity = '';
    app.nodePos.set(n.id, { x, y: p.y });

    const d = Math.hypot(x - cursorPx, (p.y - cursorPy) * (handActive ? 1 : 0.7));
    if (d < bestDist) { bestDist = d; best = n.id; }
  }

  if (!focusable) {
    if (app.focusedId) {
      app.focusedId = null;
      for (const el of document.querySelectorAll('.node')) el.classList.remove('focus');
    }
    return;
  }

  // sticky focus: once a node is lit, it takes a real departure to lose it —
  // otherwise tracking jitter keeps resetting the dwell bar
  if (app.focusedId && best !== app.focusedId) {
    const cur = app.nodePos.get(app.focusedId);
    // 1.45 held on to the old node so hard the neighbour was unpickable
    if (cur && Math.hypot(cur.x - cursorPx, cur.y - cursorPy) < CONFIG.focus.maxDistPx * 1.22) {
      best = app.focusedId;
    }
  }

  if (best !== app.focusedId) {
    app.focusedId = best;
    app.focusChangedAt = performance.now();
    app.hold.p = 0;
    for (const el of document.querySelectorAll('.node')) {
      const isBest = el.dataset.id === best;
      el.classList.toggle('focus', isBest);
      if (isBest && handActive) {
        const n = NODES.find((x) => x.id === best);
        el.querySelector('.n-sub').textContent =
          learned.open ? n.sub[lang] : UI.nodeHint[lang];
      }
    }
  }
}

// dwell-to-open: hold an open hand (or a pointing finger) on a node
function updateHold(dt, now) {
  const g = app.gestures;
  // a hand that has never MOVED is not a hand — a reclined knee or an
  // armrest reads as one and its static "fingertip" charged dwell targets
  // (field log: a chapter opened by furniture). Life = 60px of travel.
  const c = g.cursor;
  if (!g.active || !app.handAnchor) {
    app.handAnchor = { x: c.x, y: c.y };
  } else if (Math.hypot(c.x - app.handAnchor.x, c.y - app.handAnchor.y) > 60) {
    app.handAliveAt = now;
    app.handAnchor = { x: c.x, y: c.y };
  }
  const handCalm = g.active && !g.grabbing && now - app.handAliveAt < 3500 &&
    g.speed < CONFIG.hold.maxSpeed && now > app.hold.until &&
    now > app.glyphUntil;

  // in browse: dwell on the focused node → a bar fills ON THE NODE → open
  // in a chapter: dwell on the pdf link → the résumé downloads itself
  const target =
    app.state !== 'present' ? null
    : !app.spaceId && app.focusedId && app.pointer ? 'node:' + app.focusedId
    : app.spaceId && app.hoverDl ? 'dl'
    : app.spaceId && app.hoverClose ? 'close' : null;

  if (handCalm && target) {
    if (app.hold.target !== target) { app.hold.target = target; app.hold.p = 0; }
    app.hold.p = Math.min(1, app.hold.p + dt * (1000 / CONFIG.hold.ms));
    if (app.hold.p >= 1) {
      app.hold.p = 0;
      app.hold.until = now + 1500;
      if (target === 'dl' && app.hoverDl) {
        const a = app.hoverDl;
        a.click();
        a.classList.add('dl-got');
        setTimeout(() => a.classList.remove('dl-got'), 1600);
      } else if (target === 'close') {
        closeSpace();
      } else {
        if (!learned.open) {
          learned.open = true;
          try { localStorage.setItem('gl_open', '1'); } catch (_) {}
          localizeNodes();
        }
        openSpace(target.slice(5));
      }
    }
  } else {
    app.hold.p = Math.max(0, app.hold.p - dt * 2.4);
    if (!target) app.hold.target = null;
  }

  renderHoldBar();
}

// the dwell indicator lives on the node itself: silent for the first 40%
// of the hold, then a line under the label fills over the remaining 60%
function renderHoldBar() {
  const closeFill = document.querySelector('#space-close .n-fill');
  if (closeFill) {
    const pct = app.hold.target === 'close' ? clamp((app.hold.p - 0.4) / 0.6, 0, 1) : 0;
    closeFill.style.transform = `scaleX(${pct})`;
  }
  const active = app.hold.target?.startsWith('node:') ? app.hold.target.slice(5) : null;
  for (const el of document.querySelectorAll('.node')) {
    const fill = el.querySelector('.n-fill');
    if (!fill) continue;
    const pct = el.dataset.id === active
      ? clamp((app.hold.p - 0.4) / 0.6, 0, 1) : 0;
    fill.style.transform = `scaleX(${pct})`;
  }
}

function updateCursor() {
  const g = app.gestures;
  const el = $('cursor');
  // the dot lives on the nav screen too (field test 11.07: live visitors
  // could not tell where the page thought their hand was — the owner's
  // no-cursor hypothesis lost to real people, and the dot now matches the
  // chapters' close-cross grammar)
  const wanted = g.active && app.state === 'present';
  document.body.classList.toggle('cursor-on', !!wanted);
  if (!wanted) { app.hoverDl = null; return; }
  el.style.transform = `translate3d(${g.cursor.x}px, ${g.cursor.y}px, 0)`;

  // dwell targets inside a chapter: the pdf résumé and the close control.
  // the close target is MAGNETIC — a dwell target must be reachable, not
  // pixel-perfect (the node-anchor lesson, learned twice now)
  if (app.spaceId && !app.lb) {
    const under = document.elementFromPoint(g.cursor.x, g.cursor.y);
    app.hoverDl = under?.closest('#space-inner a[data-dl]') || null;
    const sc = $('space-close');
    const r = sc.getBoundingClientRect();
    const d = Math.hypot(g.cursor.x - (r.left + r.width / 2), g.cursor.y - (r.top + r.height / 2));
    app.hoverClose = d < Math.max(85, r.width * 0.8) ? sc : null;
  } else {
    app.hoverDl = null;
    app.hoverClose = null;
  }

  $('space-close').classList.toggle('focus', !!app.hoverClose);
  const over = app.hoverDl || app.hoverClose ? ' on-target' : '';
  el.className = (g.mode === 'grab' ? 'm-grab' : g.mode === 'palm' ? 'm-palm'
    : g.mode === 'point' ? 'm-point' : '') + over;
  const C = 119.4;
  el.querySelector('.c-prog').style.strokeDashoffset = String(C * (1 - app.hold.p));
}

function updateSpacePhysics(dt) {
  const inner = $('space-inner');

  // thrown-away chapter keeps flying while it fades
  if (Math.abs(app.pageXVel) > 1) {
    app.pageX += app.pageXVel * dt;
    app.pageXVel *= Math.exp(-dt * 2.2);
  } else if (!app.drag || app.drag.kind !== 'page') {
    app.pageX += (0 - app.pageX) * (1 - Math.exp(-dt * 10));   // spring home
  }

  if (!app.spaceId) {
    if (Math.abs(app.pageX) > 0.5) inner.style.transform = `translateX(${app.pageX}px)`;
    return;
  }

  app.scroll.max = Math.max(0, inner.scrollHeight - window.innerHeight);
  if (Math.abs(app.scroll.vel) > 5) {
    app.scroll.target = clamp(app.scroll.target + app.scroll.vel * dt, 0, app.scroll.max);
    app.scroll.vel *= Math.exp(-dt * 3.2);
  }
  app.scroll.y += (app.scroll.target - app.scroll.y) * (1 - Math.exp(-dt * 14));
  if (!app.drag || app.drag.kind !== 'chapter') {
    app.scroll.over *= Math.exp(-dt * 8);            // spring home
    if (Math.abs(app.scroll.over) < 0.4) app.scroll.over = 0;
  }
  inner.style.transform = `translate(${app.pageX}px, ${-app.scroll.y + app.scroll.over}px)`;

  // position hint: appears on grip / motion, shows where you are in the text
  const hint = $('scroll-hint');
  if (hint) {
    const busy = document.body.classList.contains('gripping') ||
      Math.abs(app.scroll.vel) > 40 || app.scroll.over !== 0;
    // shown even when there is nothing to scroll: a full, dim bar says
    // "the whole chapter is already on screen" instead of saying nothing
    hint.classList.toggle('on', busy);
    hint.classList.toggle('full', app.scroll.max <= 0);
    const frac = window.innerHeight / (inner.scrollHeight || 1);
    const th = Math.max(0.08, Math.min(1, frac));
    const pos = app.scroll.max > 0 ? app.scroll.y / app.scroll.max : 0;
    const bar = hint.firstElementChild;
    bar.style.height = `${th * 100}%`;
    bar.style.top = `${pos * (1 - th) * 100}%`;
  }

  for (const s of app.strips) {
    const { min, max } = stripBounds(s);
    const dragging = app.drag?.kind === 'chapter' && app.drag.strip === s;
    if (!dragging) {
      if (Math.abs(s.vel) > 5) {
        s.x += s.vel * dt;
        s.vel *= Math.exp(-dt * 2.6);
      }
      // spring back from the rubber zone
      if (s.x > max) { s.x += (max - s.x) * (1 - Math.exp(-dt * 10)); s.vel = 0; }
      else if (s.x < min) { s.x += (min - s.x) * (1 - Math.exp(-dt * 10)); s.vel = 0; }
    }
    // photos lean into the motion — matter, not a carousel
    const prevX = s._lastX ?? s.x;
    const instV = (s.x - prevX) / Math.max(dt, 1e-3);
    s._lastX = s.x;
    s._tilt = (s._tilt ?? 0) + (clamp(instV / 260, -7, 7) - (s._tilt ?? 0)) * (1 - Math.exp(-dt * 8));
    s.track.style.transform = `translateX(${s.x}px)`;
    s.track.style.setProperty('--tilt', s._tilt.toFixed(2));
  }
}

// the hand physically touches the particle fabric — exactly where the
// visitor sees their own hand in the mirror
function updateFieldTouch() {
  const g = app.gestures;
  if (app.ghost) return;                      // the ghost hand owns the fabric
  if (g.active && app.state === 'present' && g.hand) {
    const tip = {
      x: g.hand.index.x * 0.55 + g.hand.palm.x * 0.45,
      y: g.hand.index.y * 0.55 + g.hand.palm.y * 0.45,
    };
    const local = app.field.frameToLocal(tip.x, tip.y, 0);
    const strength = 0.22 + 0.4 * g.pinchStrength;
    app.field.setHandLocal(local.x, local.y, strength);
  } else {
    app.field.setHandLocal(null, 0, 0);
  }
}

// nobody lifts a hand — so the reflection does it first: a ghost of dots
// rises from the form and reaches for a node, then dissolves. Not a
// tutorial; the mirror showing what it can feel.
function updateGhostHand(now) {
  if (app.ghost) {
    const gh = app.ghost;
    if (app.gestures.active || app.state !== 'present' || app.spaceId) {
      app.field.setHandLocal(null, 0, 0);
      app.ghost = null;
      return;
    }
    const p = clamp((now - gh.t0) / gh.dur, 0, 1);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;   // easeInOut
    const x = gh.from.x + (gh.to.x - gh.from.x) * e;
    const y = gh.from.y + (gh.to.y - gh.from.y) * e;
    const strength = Math.sin(Math.PI * Math.min(1, p * 1.12)) * 1.2;
    app.field.setHandLocal(x, y, strength);
    if (p >= 1) { app.field.setHandLocal(null, 0, 0); app.ghost = null; }
    return;
  }
  if (app.gestures.active) app.lastHandAt = now;
  if (app.state !== 'present' || app.spaceId) return;
  if (app.gestures.active || app.hands.failed) return;
  if (!app.nodesShown || now - app.presentSince < 6000) return;

  // the cold visitor never sits still — he grabs the mouse (cold-test
  // verdict: the idle trigger below almost never gets its silence). So the
  // mirror answers the mouse: hovering a node with the cursor while the
  // hands stay down makes the reflection reach for that same node — "your
  // reflection can do what you are doing". Once a real hand has spoken this
  // session, the mirror stops demonstrating.
  if (app.lastHandAt === 0 && app.mouseAt && now - app.mouseAt.t < 3000 &&
      now - app.lastGhostAt > 14000) {
    const id = hoveredNodeId();
    if (!id) {
      app.mouseHover = null;
    } else if (app.mouseHover?.id !== id) {
      app.mouseHover = { id, t0: now };
    } else if (now - app.mouseHover.t0 > 450) {
      const n = NODES.find((k) => k.id === id);
      if (n) {
        app.mouseHover = null;
        app.lastGhostAt = now;
        app.ghost = {
          t0: now, dur: 2200,
          from: { x: 0, y: -3.4 },
          to: { x: n.anchor.x, y: n.anchor.y },
        };
        return;
      }
    }
  }

  if (now - app.lastHandAt < 8000 && app.lastHandAt > 0) return;
  if (now - app.lastGhostAt < 30000) return;
  // reach for the node nearest to the form's centre
  let best = null, bd = Infinity;
  for (const n of NODES) {
    const d = Math.hypot(n.anchor.x, n.anchor.y);
    if (d < bd) { bd = d; best = n; }
  }
  if (!best) return;
  app.lastGhostAt = now;
  app.ghost = {
    t0: now, dur: 2600,
    from: { x: 0, y: -3.4 },
    to: { x: best.anchor.x, y: best.anchor.y },
  };
}

// which node the MOUSE cursor is resting on (inflated hitbox — the label
// area, not the exact glyphs); the ghost aims where the visitor aims
function hoveredNodeId() {
  const m = app.mouseAt;
  if (!m) return null;
  for (const el of document.querySelectorAll('.node.shown')) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    if (m.x > r.left - 30 && m.x < r.right + 30 &&
        m.y > r.top - 30 && m.y < r.bottom + 30) return el.dataset.id;
  }
  return null;
}

// quiet invitation: if nothing happens for a while, one node breathes once
function updateIdlePulse(now) {
  if (app.state !== 'present' || app.spaceId || !app.nodesShown) return;
  if (now - Math.max(app.lastActivity, app.presentSince) < 8000) return;
  if (now - app.lastPulse < 9000) return;
  app.lastPulse = now;
  const id = app.focusedId || NODES[Math.floor(Math.random() * NODES.length)].id;
  const el = document.querySelector(`.node[data-id="${id}"]`);
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

// ---------------------------------------------------------------- chrome

function renderStatic() {
  document.title = UI.title[lang];
  document.documentElement.lang = lang;

  setText('mark', UI.mark[lang]);
  setText('identity-name', UI.name[lang]);
  setText('identity-role', UI.role[lang]);

  setText('invite-h', returning ? UI.invite.hReturn[lang] : UI.invite.h[lang]);
  setText('invite-action-t', UI.invite.a[lang]);
  setText('invite-s', UI.invite.s[lang]);
  setText('invite-s2', UI.invite.s2[lang]);
  setText('mobile-note', UI.mobileNote[lang]);

  setText('denied-h', UI.denied.h[lang]);
  setText('denied-s', UI.denied.s[lang]);
  setText('denied-action', UI.denied.a[lang]);

  setText('space-close-t', UI.close[lang]);
  setText('asleep-h', UI.asleep.h[lang]);
  setText('asleep-s', UI.asleep.s[lang]);
  setText('asleep-action', UI.asleep.a[lang]);

  setText('failed-h', UI.failed.h[lang]);
  setText('failed-s', UI.failed.s[lang]);

  setText('mobile-h', UI.mobile.h[lang]);
  setText('mobile-s', UI.mobile.s[lang]);
  setText('mobile-name', UI.name[lang]);
  setText('mobile-role', UI.role[lang]);

  for (const holder of ['denied-links', 'failed-links', 'mobile-links', 'asleep-links']) {
    const el = $(holder);
    if (!el) continue;
    el.innerHTML = UI.contactsMini.map((c) =>
      `<a href="${c.href}" ${c.href.startsWith('http') || c.href.endsWith('.pdf')
        ? 'target="_blank" rel="noopener"' : ''}>${c.label[lang]}</a>`).join('');
  }

  for (const b of document.querySelectorAll('#lang button')) {
    b.classList.toggle('on', b.dataset.lang === lang);
    b.onclick = () => setLang(b.dataset.lang);
  }
}

function setLang(l) {
  if (l === lang) return;
  lang = l;
  localStorage.setItem('lang', l);
  renderStatic();
  localizeNodes();
  syncGhint();
  if (app.spaceId) {
    renderSpaceContent(NODES.find((n) => n.id === app.spaceId));
  }
}

function renderTelemetry() {
  const T = UI.telemetry;
  const rows = [];
  rows.push(app.cameraOn ? T.eyeOn[lang] : T.eyeOff[lang]);
  if (app.state === 'failed') rows.push('—');
  else if (app.state === 'asleep') rows.push(`${T.mindLoad[lang]} · —`);
  else if (!app.modelReady) rows.push(`${T.mindLoad[lang]} · ${Math.round(app.loadP * 100)}%`);
  else rows.push(app.device === 'webgpu' ? T.mindGpu[lang] : T.mindCpu[lang]);
  if (app.cameraOn) {
    if (app.handsFailed) rows.push(T.handsFail[lang]);
    else if (!app.handsReady) rows.push(T.handsLoad[lang]);
    else if (app.gestures?.active) rows.push(T.handsOn[lang]);
    else if (app.signals?.present) rows.push(T.handsOff[lang]);
  }
  rows.push(`${Math.round(fpsE)} ${T.fps[lang]}`);
  $('telemetry').innerHTML = rows.map((r) => `<span>${r}</span>`).join('');
}

// debug panel modes: hidden → full → mini → hidden
function cycleDebug() {
  const el = $('debug');
  if (el.classList.contains('hidden')) {
    el.classList.remove('hidden', 'mini');
  } else if (!el.classList.contains('mini')) {
    el.classList.add('mini');
  } else {
    el.classList.add('hidden');
    el.classList.remove('mini');
  }
}

function toggleRec() {
  // stop KEEPS the buffer — the whole point of recording is to copy it after;
  // a new rec starts a fresh trace
  if (app.recOn) {
    app.recOn = false;
  } else {
    app.rec = [];
    app.recOn = true;
  }
  const b = $('debug-rec');
  if (b) b.textContent = app.recOn ? 'rec ● пишет' : (app.rec?.length ? 'rec ✓ · ⌥T' : 'rec (⌥R)');
}

function toggleGRec() {
  // same contract as ⌥R: stop keeps the buffer, a new start wipes it
  if (app.grecOn) {
    app.grecOn = false;
    app._grecBox = null;
  } else {
    app.grec = [];
    app.grecD = [];
    app.grecOn = true;
  }
  const b = $('debug-grec');
  if (b) b.textContent = app.grecOn ? 'rec+ ● пишет' : (app.grec?.length ? 'rec+ ✓ · ⌥T' : 'rec+ (⌥G)');
}

// Uint8Array → base64, chunked (fromCharCode chokes on long arrays)
function b64u8(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function logHead() {
  const s = app.signals, g = app.gestures;
  return [
    `# living-interface log · ${new Date().toISOString()}`,
    `state ${app.state} space ${app.spaceId || '—'} lb ${!!app.lb}`,
    `pinch ${g.hand?.pinch?.toFixed(2) ?? '—'} base ${g._pinchSlow?.toFixed(2) ?? '—'} size ${g.hand?.size?.toFixed(2) ?? '—'}`,
    `score ${s?.score.toFixed(3)} frac ${s?.frac.toFixed(3)} device ${app.device}`,
    '',
  ];
}

// clipboard API rejects silently in plenty of real situations (focus,
// permissions) — fall back to the old textarea trick, and always say
// out loud whether the text actually landed in the buffer
function copyText(text, btnId, idleLabel) {
  const done = (ok) => {
    const b = $(btnId);
    if (!b) return;
    b.textContent = ok ? 'скопировано ✓' : 'не вышло ✗';
    setTimeout(() => { b.textContent = idleLabel; }, 1800);
  };
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      done(ok);
    } catch { done(false); }
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true), fallback);
  } else fallback();
}

function copyLog() {
  copyText(logHead().concat(app.glogFull).join('\n'), 'debug-copy', 'copy log (⌥C)');
}

function copyRec() {
  const trace = app.rec && app.rec.length
    ? ['--- trace: t pinch open size palmX palmY indexX indexY wristX wristY', ...app.rec]
    : ['--- trace: пусто (⌥R, движение, ⌥R)'];
  const ghost = app.grec && app.grec.length
    ? ['--- ghost: скелеты + глубина, JSON {hands, depth}',
      JSON.stringify({ hands: app.grec, depth: app.grecD || [] })]
    : [];
  copyText(logHead().concat(trace, ghost).join('\n'), 'debug-copyrec', 'copy rec (⌥T)');
}

function renderDebug() {
  const el = $('debug');
  if (el.classList.contains('hidden')) return;
  if (!$('debug-copy')) {
    const tools = document.createElement('div');
    tools.id = 'debug-tools';
    const mode = document.createElement('button');
    mode.id = 'debug-mode';
    mode.textContent = 'вид';
    mode.addEventListener('click', cycleDebug);
    const b = document.createElement('button');
    b.id = 'debug-copy';
    b.textContent = 'copy log (⌥C)';
    b.addEventListener('click', copyLog);
    const rec = document.createElement('button');
    rec.id = 'debug-rec';
    rec.textContent = 'rec (⌥R)';
    rec.addEventListener('click', toggleRec);
    const grec = document.createElement('button');
    grec.id = 'debug-grec';
    grec.textContent = 'rec+ (⌥G)';
    grec.addEventListener('click', toggleGRec);
    const cr = document.createElement('button');
    cr.id = 'debug-copyrec';
    cr.textContent = 'copy rec (⌥T)';
    cr.addEventListener('click', copyRec);
    tools.append(mode, b, rec, grec, cr);
    el.before(tools);
    // the copy button deliberately outlives the panel — the log is most
    // wanted right after you've hidden the numbers
  }
  const s = app.signals, g = app.gestures;
  if (el.classList.contains('mini')) {
    el.textContent = [
      `${app.state}${app.spaceId ? '·' + app.spaceId : ''}${app.lb ? '·lb' : ''}  pinch ${g.hand?.pinch?.toFixed(2) ?? '—'}`,
      app.glog.slice(-2).join('\n') || '—',
    ].join('\n');
    return;
  }
  el.textContent = [
    `state    ${app.state}${app.spaceId ? ' · space:' + app.spaceId : ''}`,
    `score    ${s.score.toFixed(3)}  frac ${s.frac.toFixed(3)}`,
    `motion   ${s.motion.toFixed(4)}  peak ${s.motionPeak.toFixed(4)}`,
    `prox     ${s.proximity.toFixed(3)}  base ${s.baseline.toFixed(3)}`,
    `head     ${s.cx.toFixed(2)} ${s.cy.toFixed(2)}`,
    `hand     ${g.active ? g.mode : '—'}  v ${Math.round(g.speed)}`,
    `pinch    ${g.hand ? g.hand.pinch.toFixed(2) : '—'}  base ${g._pinchSlow?.toFixed(2) ?? '—'}  size ${g.hand?.size.toFixed(2) ?? '—'}`,
    `focus    ${app.focusedId || '—'}  hold ${app.hold.p.toFixed(2)}`,
    `infer    ${Math.round(app.engine?.inferMs || 0)}ms · ${app.device || '…'} · ${app.engine?.intervalMs}ms`,
    `hands    ${app.handsFailed ? 'FAILED' : app.handsReady ? 'ready' : 'loading'}`,
    `body     ${app.poseFailed ? 'fallback:depth' : app.poseReady
      ? `vis ${s.vis?.toFixed(2) ?? '—'} head ${s.cx.toFixed(2)},${s.cy.toFixed(2)}` : 'loading'}`,
    `events   ${app.glog.slice(-5).join('  ·  ') || '—'}`,
  ].join('\n');
}

function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
