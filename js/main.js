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
import { Gestures } from './gestures.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- environment

const isMobile =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && !matchMedia('(pointer: fine)').matches);

let lang = localStorage.getItem('lang') ||
  ((navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en');

// the interface remembers a returning visitor
const returning = !!localStorage.getItem('visited');
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
    this.panelOpen = false;
    this.openBaseline = 0;
    this.lastLeanEnd = 0;
    this._enterAt = null;
    this._exitAt = null;
    this._leanAt = null;
    this._closeAt = null;
  }

  feed(stats, now) {
    const c = this.cfg;
    const compact = 1 - clamp((stats.spread - c.spreadLo) / (c.spreadHi - c.spreadLo), 0, 1);
    const rawScore = clamp(stats.frac / 0.10, 0, 1) * compact;

    ema(this, 'score', rawScore, 0.30);
    ema(this, 'frac', stats.frac, 0.30);
    ema(this, 'motion', stats.motion, 0.25);
    ema(this, 'cx', 1 - stats.cx, 0.22);          // mirrored
    ema(this, 'cy', stats.cy, 0.22);

    this.motionPeak = Math.max(this.motionPeak * 0.96, stats.motion);

    this.proximity += (clamp((this.frac - c.proxMin) / (c.proxMax - c.proxMin), 0, 1)
      - this.proximity) * 0.25;

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
  glog: [],                 // last recognized gesture events (debug)
  glogFull: [],             // whole-session log, copyable from the panel
  hoverDl: null,            // a[data-dl] under the hand cursor
  focusChangedAt: 0,
  device: null,
  loadP: 0,
  presentSince: 0,
  nodePos: new Map(),       // id → {x, y} screen px
  pointer: null,            // fingertip of the REFLECTION, screen px (main screen)
  lastDepth: null,
  hold: { p: 0, target: null, until: 0 },
  scroll: { y: 0, target: 0, vel: 0, max: 0 },
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

if (isMobile) {
  document.body.classList.add('is-mobile');
  renderStatic();
  $('mobile').classList.remove('hidden');
} else {
  boot();
}

function boot() {
  renderStatic();

  const field = new Field($('scene'));
  const engine = new DepthEngine();
  const hands = new HandsEngine();
  const gestures = new Gestures();
  const signals = new Signals(CONFIG.presence);
  Object.assign(app, { field, engine, hands, gestures, signals });

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
  engine.addEventListener('depth', (e) => {
    const { data, width, height, stats } = e.detail;
    field.setDepth(data, width, height, engine.inferMs);
    app.lastDepth = { data, width, height };     // texture copies; safe to keep
    signals.feed(stats, performance.now());
  });

  // -- presence semantics
  signals.onPresence = (on) => on ? enterPresent() : leavePresent();
  // lean-based open/close is deliberately gone: proximity was firing
  // by accident and eroded trust in the whole gesture layer

  // -- hand pipeline
  hands.addEventListener('ready', () => { app.handsReady = true; });
  hands.addEventListener('fatal', () => { app.handsFailed = true; });
  hands.addEventListener('hands', (e) => gestures.ingest(e.detail));

  for (const ev of ['enter', 'leave', 'grabstart', 'grabend', 'tap', 'swipe', 'spreadstart', 'spreadend']) {
    gestures.addEventListener(ev, (e) => {
      const h = gestures.hand;
      const line = `${(performance.now() / 1000).toFixed(1)}s ${ev}` +
        `${e.detail?.dir ? ' ' + e.detail.dir : ''}` +
        `${h ? `  pinch ${h.pinch.toFixed(2)} size ${h.size.toFixed(2)}` : ''}` +
        `  [${app.lb ? 'lightbox' : app.spaceId ? 'chapter:' + app.spaceId : app.state}]`;
      app.glog.push(line);
      if (app.glog.length > 6) app.glog.shift();
      app.glogFull.push(line);
      if (app.glogFull.length > 500) app.glogFull.shift();
    });
  }

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
  gestures.addEventListener('spreadstart', () => onSpreadStart());
  gestures.addEventListener('spreadmove', (e) => onSpreadMove(e.detail));
  gestures.addEventListener('spreadend', (e) => onSpreadEnd(e.detail));
  for (const ev of ['enter', 'grabstart', 'tap', 'swipe', 'spreadstart'])
    gestures.addEventListener(ev, () => { app.lastActivity = performance.now(); });

  engine.initWorker();

  // -- chrome events
  $('invite-action').addEventListener('click', requestCamera);
  $('denied-action').addEventListener('click', requestCamera);

  window.addEventListener('resize', () => field.resize());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (app.lb) closeLightbox(); else closeSpace(); }
    if (app.lb && e.key === 'ArrowRight') lightboxStep(1);
    if (app.lb && e.key === 'ArrowLeft') lightboxStep(-1);
    if (e.code === 'KeyD' && (e.altKey || e.ctrlKey)) $('debug').classList.toggle('hidden');
    if (e.code === 'KeyC' && e.altKey) copyLog();
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
        !e.target.closest('.node') && !e.target.closest('#lang')) {
      closeSpace();
    }
  });

  // silent mouse/wheel fallbacks — never advertised, always working
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('mousedown', onMouseDown);

  requestAnimationFrame(loop);
}

async function requestCamera() {
  hide('denied');
  try {
    await app.engine.startCamera();
    app.cameraOn = true;
    hide('invite');
    app.state = 'watching';
    app.field.setTargets({ coherence: CONFIG.coherence.watching });
    document.body.classList.add('camera-on');
    app.hands.init(app.engine.video);
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
  app.hands.start();
  applyCadence();
  setTimeout(() => {
    if (app.state === 'present') document.body.classList.add('named');
  }, CONFIG.reveal.nameMs);
}

function leavePresent() {
  app.state = 'watching';
  app.nodesShown = false;
  app.field.setTargets({ coherence: CONFIG.coherence.watching });
  document.body.classList.remove('named', 'nodes-on', 'hand-on');
  closeSpace();
  app.hands.stop();
  applyCadence();
  for (const el of document.querySelectorAll('.node')) el.classList.remove('shown', 'focus');
  app.focusedId = null;
}

function applyCadence() {
  const present = app.signals?.present;
  const open = !!app.spaceId;
  app.engine.setCadence(present
    ? (open ? CONFIG.cadence.depthReading : CONFIG.cadence.depthPresent)
    : CONFIG.cadence.depthIdle);
  app.hands.setCadence(present ? CONFIG.cadence.handsPresent : CONFIG.cadence.handsIdle);
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
  app.signals.panelOpen = true;
  app.signals.openBaseline = app.signals.baseline;
  app.hold.p = 0;
  app.hold.until = performance.now() + 1200;

  $('space-inner').innerHTML = renderPanel(node, lang);
  app.scroll.y = 0; app.scroll.target = 0; app.scroll.vel = 0;
  app.pageX = 0; app.pageXVel = 0;
  $('space-inner').style.transform = 'translateY(0px)';
  collectStrips();

  document.body.classList.add('space-open');
  document.body.classList.toggle('space-right', (node.pose?.x ?? 1) < 0);
  app.field.setPose(node.pose || { x: 0.46, rotY: -0.5, scale: 0.9, dim: 0 });
  applyCadence();
}

function closeSpace() {
  if (!app.spaceId) return;
  app.spaceId = null;
  app.signals.panelOpen = false;
  app.signals.lastLeanEnd = performance.now();
  app.hold.until = performance.now() + 900;
  app.strips = [];
  app.drag = null;
  closeLightbox();
  document.body.classList.remove('space-open');
  app.field.setPose(null);
  applyCadence();
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
    // axis lock, biased toward scroll: human vertical pulls start with a
    // sideways arc, so horizontal must be clearly dominant to win — and
    // only a strip can take it. The chapter itself never slides sideways.
    app.drag = { kind: 'pending', strip: hitStrip(x, y), accX: 0, accY: 0 };
  }
  // grabbing on the main screen deliberately does nothing:
  // the mirror is a mirror, not a knob
}

function onGrabMove({ dx, dy }) {
  let d = app.drag;
  if (!d) return;
  if (d.kind === 'pending') {
    d.accX += dx; d.accY += dy;
    if (Math.hypot(d.accX, d.accY) < 26) return;
    const { accX, accY, strip } = d;
    if (strip && Math.abs(accX) > Math.abs(accY) * 1.8) {
      app.drag = d = { kind: 'strip', strip };
      strip.vel = 0;
      strip.el.classList.add('dragging');
      moveStrip(strip, accX);
      return;
    }
    app.drag = d = { kind: 'scroll' };
    app.scroll.target = clamp(app.scroll.target - accY, 0, app.scroll.max);
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
  } else if (d.kind === 'strip') {
    moveStrip(d.strip, dx);
  } else if (d.kind === 'scroll') {
    // dead-zone kills tremor, the cap kills jumps, the EMA rounds the rest
    const step = Math.abs(dy) < 1.5 ? 0 : clamp(dy, -70, 70);
    d.flt = (d.flt ?? 0) * 0.5 + step * 0.5;
    app.scroll.target = clamp(app.scroll.target - d.flt, 0, app.scroll.max);
    app.scroll.vel = 0;
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
  } else if (d.kind === 'strip') {
    d.strip.vel = vx;
    d.strip.el.classList.remove('dragging');
  } else if (d.kind === 'scroll') {
    app.scroll.vel = -vy;
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
}

function onSpreadEnd({ scale }) {
  if (app.lb) return;                                  // zoom already applied live
  if (app.spaceId && scale > 1.35) {
    const { x, y } = app.gestures.cursor;
    const figs = currentStripItems();
    let best = null, bd = Infinity;
    for (const f of figs) {
      const r = f.getBoundingClientRect();
      if (r.width === 0) continue;
      const d = Math.abs(r.left + r.width / 2 - x) + Math.abs(r.top + r.height / 2 - y) * 0.6;
      if (d < bd) { bd = d; best = f; }
    }
    if (best) openLightbox(best);
  }
}

function cancelDrag() {
  const d = app.drag;
  if (!d) return;
  if (d.kind === 'strip') d.strip.el.classList.remove('dragging');
  if (d.kind === 'lightbox' || d.kind === 'lb-toss') {
    $('lb-img').style.transform = '';
    $('lb-img').style.opacity = '';
  }
  app.drag = null;
}

// open-palm fling ⟷ flips; open-palm brush ↓ closes the current layer
function onSwipe({ axis, dir, vx }) {
  if (axis === 'y') {
    if (app.lb) closeLightbox();
    else if (app.spaceId) closeSpace();
    return;
  }
  if (app.lb) { lightboxStep(dir === 'left' ? 1 : -1); return; }
  if (app.spaceId && app.gestures.active) {
    const s = hitStrip(app.gestures.cursor.x, app.gestures.cursor.y);
    if (s) s.vel = vx * 0.9;
  }
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
  if (app.state === 'present' && app.focusedId) openSpace(app.focusedId);
}

// ---------------------------------------------------------------- lightbox

function currentStripItems() {
  return [...document.querySelectorAll('#space-inner .strip figure')];
}

function openLightbox(fig) {
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
      const nodesDelay = returning ? CONFIG.reveal.nodesMs * 0.45 : CONFIG.reveal.nodesMs;
      if (!app.nodesShown && t - app.presentSince > nodesDelay) revealNodes();
      if (app.nodesShown && !app.spaceId) updateNodes(headX, handActive);
    }

    field.frame(dt * (lowPower ? 2 : 1));
  }

  updateHold(dt, t);
  updateCursor();
  updateSpacePhysics(dt);
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
  const tip = h.pointing ? h.index : g.grabbing ? h.pinchPoint : h.palm;
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

function updateNodes(focusX, handActive) {
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

  // sticky focus: once a node is lit, it takes a real departure to lose it —
  // otherwise tracking jitter keeps resetting the dwell bar
  if (app.focusedId && best !== app.focusedId) {
    const cur = app.nodePos.get(app.focusedId);
    if (cur && Math.hypot(cur.x - cursorPx, cur.y - cursorPy) < CONFIG.focus.maxDistPx * 1.45) {
      best = app.focusedId;
    }
  }

  if (best !== app.focusedId) {
    app.focusedId = best;
    app.focusChangedAt = performance.now();
    app.hold.p = 0;
    for (const el of document.querySelectorAll('.node')) {
      el.classList.toggle('focus', el.dataset.id === best);
    }
  }
}

// dwell-to-open: hold an open hand (or a pointing finger) on a node
function updateHold(dt, now) {
  const g = app.gestures;
  const handCalm = g.active && !g.grabbing &&
    g.speed < CONFIG.hold.maxSpeed && now > app.hold.until;

  // in browse: dwell on the focused node → a bar fills ON THE NODE → open
  // in a chapter: dwell on the pdf link → the résumé downloads itself
  const target =
    app.state !== 'present' ? null
    : !app.spaceId && app.focusedId && app.pointer ? 'node:' + app.focusedId
    : app.spaceId && app.hoverDl ? 'dl' : null;

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
      } else {
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
  const wanted = g.active && app.state === 'present' && (app.spaceId || app.lb);
  document.body.classList.toggle('cursor-on', !!wanted);
  if (!wanted) { app.hoverDl = null; return; }
  el.style.transform = `translate3d(${g.cursor.x}px, ${g.cursor.y}px, 0)`;

  // the one gesture-enabled link: the pdf résumé
  if (app.spaceId && !app.lb) {
    const under = document.elementFromPoint(g.cursor.x, g.cursor.y);
    app.hoverDl = under?.closest('#space-inner a[data-dl]') || null;
  } else {
    app.hoverDl = null;
  }

  const over = app.hoverDl ? ' on-target' : '';
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
  app.scroll.y += (app.scroll.target - app.scroll.y) * (1 - Math.exp(-dt * 9));
  inner.style.transform = `translate(${app.pageX}px, ${-app.scroll.y}px)`;

  for (const s of app.strips) {
    const { min, max } = stripBounds(s);
    const dragging = app.drag?.kind === 'strip' && app.drag.strip === s;
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
  if (g.active && app.state === 'present' && g.hand) {
    const tip = g.hand.pointing ? g.hand.index : g.hand.palm;
    const local = app.field.frameToLocal(tip.x, tip.y, 0);
    const strength = 0.22 + 0.4 * g.pinchStrength;
    app.field.setHandLocal(local.x, local.y, strength);
  } else {
    app.field.setHandLocal(null, 0, 0);
  }
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

  setText('denied-h', UI.denied.h[lang]);
  setText('denied-s', UI.denied.s[lang]);
  setText('denied-action', UI.denied.a[lang]);

  setText('failed-h', UI.failed.h[lang]);
  setText('failed-s', UI.failed.s[lang]);

  setText('mobile-h', UI.mobile.h[lang]);
  setText('mobile-s', UI.mobile.s[lang]);
  setText('mobile-name', UI.name[lang]);
  setText('mobile-role', UI.role[lang]);

  for (const holder of ['denied-links', 'failed-links', 'mobile-links']) {
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
  if (app.spaceId) {
    const node = NODES.find((n) => n.id === app.spaceId);
    $('space-inner').innerHTML = renderPanel(node, lang);
    collectStrips();
  }
}

function renderTelemetry() {
  const T = UI.telemetry;
  const rows = [];
  rows.push(app.cameraOn ? T.eyeOn[lang] : T.eyeOff[lang]);
  if (app.state === 'failed') rows.push('—');
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

function copyLog() {
  const s = app.signals, g = app.gestures;
  const head = [
    `# living-interface log · ${new Date().toISOString()}`,
    `state ${app.state} space ${app.spaceId || '—'} lb ${!!app.lb}`,
    `pinch ${g.hand?.pinch?.toFixed(2) ?? '—'} base ${g._pinchSlow?.toFixed(2) ?? '—'} size ${g.hand?.size?.toFixed(2) ?? '—'}`,
    `score ${s?.score.toFixed(3)} frac ${s?.frac.toFixed(3)} device ${app.device}`,
    '',
  ];
  navigator.clipboard?.writeText(head.concat(app.glogFull).join('\n')).then(() => {
    const b = $('debug-copy');
    if (b) { b.textContent = 'скопировано ✓'; setTimeout(() => { b.textContent = 'copy log (⌥C)'; }, 1500); }
  });
}

function renderDebug() {
  const el = $('debug');
  if (el.classList.contains('hidden')) return;
  if (!$('debug-copy')) {
    const b = document.createElement('button');
    b.id = 'debug-copy';
    b.textContent = 'copy log (⌥C)';
    b.addEventListener('click', copyLog);
    el.after(b);
  }
  $('debug-copy').classList.toggle('hidden', el.classList.contains('hidden'));
  const s = app.signals, g = app.gestures;
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
    `events   ${app.glog.slice(-5).join('  ·  ') || '—'}`,
  ].join('\n');
}

function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
