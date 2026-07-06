// Orchestrator: state machine, presence signals, gestures, DOM choreography.
//
// States: boot → (invite) → watching ⇄ present ⇄ space(chapter)
//                ↘ denied / failed          mobile is a separate early exit.
//
// Opening a chapter: dwell an open hand or a pointing finger on a node,
// lean toward the screen, or silently click. Closing: swipe the content
// away, lean back, step out of frame, Esc, or click the empty side.

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
  device: null,
  loadP: 0,
  presentSince: 0,
  nodePos: new Map(),       // id → {x, y} screen px
  hold: { p: 0, target: null, until: 0 },
  scroll: { y: 0, target: 0, vel: 0, max: 0 },
  strips: [],
  drag: null,               // null | {kind:'strip'|'scroll'|'stir'|'lightbox', ...}
  lb: null,                 // lightbox: {items:[{src,cap}], idx, acc}
  lastActivity: 0,
  lastPulse: 0,
};

window.__app = app;   // debug / integration-test hook

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
    signals.feed(stats, performance.now());
  });

  // -- presence semantics
  signals.onPresence = (on) => on ? enterPresent() : leavePresent();
  signals.onLeanIn = () => { if (app.focusedId && !app.spaceId) openSpace(app.focusedId); };
  signals.onLeanBack = () => { if (app.lb) closeLightbox(); else closeSpace(); };

  // -- hand pipeline
  hands.addEventListener('ready', () => { app.handsReady = true; });
  hands.addEventListener('hands', (e) => gestures.ingest(e.detail));

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
  gestures.addEventListener('poke', (e) => onAirTap(e.detail));
  gestures.addEventListener('swipe', (e) => onSwipe(e.detail));
  for (const ev of ['enter', 'grabstart', 'tap', 'poke', 'swipe'])
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
    if (e.key === 'd' && e.altKey) $('debug').classList.toggle('hidden');
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
    el.innerHTML = `<span class="n-label"></span><span class="n-sub"></span>`;
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
    app.drag = { kind: 'lightbox', acc: 0 };
  } else if (app.spaceId) {
    const s = hitStrip(x, y);
    app.drag = s ? { kind: 'strip', strip: s } : { kind: 'scroll' };
    if (s) { s.vel = 0; s.el.classList.add('dragging'); }
  } else if (app.state === 'present') {
    app.drag = { kind: 'stir' };
  }
}

function onGrabMove({ dx, dy }) {
  const d = app.drag;
  if (!d) return;
  if (d.kind === 'lightbox') {
    d.acc += dx;
    $('lb-img').style.transform = `translateX(${d.acc * 0.35}px)`;
    if (Math.abs(d.acc) > 150) {
      lightboxStep(d.acc < 0 ? 1 : -1);
      d.acc = 0;
    }
  } else if (d.kind === 'strip') {
    moveStrip(d.strip, dx);
  } else if (d.kind === 'scroll') {
    app.scroll.target = clamp(app.scroll.target - dy, 0, app.scroll.max);
    app.scroll.vel = 0;
  } else if (d.kind === 'stir') {
    app.field.addStir(dx, dy);
  }
}

function onGrabEnd({ vx, vy }) {
  const d = app.drag;
  if (!d) return;
  if (d.kind === 'lightbox') {
    $('lb-img').style.transform = '';
  } else if (d.kind === 'strip') {
    d.strip.vel = vx;
    d.strip.el.classList.remove('dragging');
  } else if (d.kind === 'scroll') {
    app.scroll.vel = -vy;
  }
  app.drag = null;
}

// air-tap / poke: acts like a click at the cursor — people jab at screens
function onAirTap({ x, y }) {
  if (app.lb) {
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
    if (link) { link.click(); return; }
    return;
  }
  if (app.state === 'present' && app.focusedId) openSpace(app.focusedId);
}

function onSwipe({ axis, dir }) {
  if (app.lb) {
    if (axis === 'x') lightboxStep(dir === 'left' ? 1 : -1);
    else closeLightbox();
    return;
  }
  if (!app.spaceId) return;
  if (axis === 'x') {
    closeSpace();
  } else {
    const step = window.innerHeight * 0.55 * (dir === 'up' ? 1 : -1);
    app.scroll.target = clamp(app.scroll.target + step, 0, app.scroll.max);
  }
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
    })),
    idx,
  };
  renderLightbox();
  document.body.classList.add('lb-open');
}

// step past the last photo → the chapter takes you back (reversible exit)
function lightboxStep(delta) {
  if (!app.lb) return;
  const next = app.lb.idx + delta;
  if (next >= app.lb.items.length) { closeLightbox(); return; }
  if (next < 0) { closeLightbox(); return; }
  app.lb.idx = next;
  renderLightbox();
}

function renderLightbox() {
  const { items, idx } = app.lb;
  const img = $('lb-img');
  img.classList.remove('lb-anim');
  void img.offsetWidth;                      // restart the entry animation
  img.src = items[idx].src;
  img.classList.add('lb-anim');
  $('lb-cap').textContent = items[idx].cap;
  $('lb-count').textContent = `${idx + 1} / ${items.length}`;
}

function closeLightbox() {
  if (!app.lb) return;
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
      const focusX = handActive
        ? clamp((gestures.cursor.x / window.innerWidth - 0.5) * 2, -1.6, 1.6)
        : clamp((signals.cx - 0.5) * 2 * CONFIG.focus.gain, -1.6, 1.6);
      field.setGaze(focusX * 0.5, signals.cy);
      if (!app.nodesShown && t - app.presentSince > CONFIG.reveal.nodesMs) revealNodes();
      if (app.nodesShown && !app.spaceId) updateNodes(focusX, handActive);
    } else {
      field.setGaze(Math.sin(t * 0.00013) * 0.25, 0.5);
    }

    field.frame(dt * (lowPower ? 2 : 1));
  }

  updateHold(dt, t);
  updateCursor();
  updateSpacePhysics(dt);
  updateFieldTouch();
  updateIdlePulse(t);

  if (t - lastTele > 500) { lastTele = t; renderTelemetry(); renderDebug(); }
  requestAnimationFrame(loop);
}

function updateNodes(focusX, handActive) {
  const cursorPx = handActive
    ? app.gestures.cursor.x
    : window.innerWidth * (0.5 + 0.5 * clamp(focusX, -1, 1) * 0.8);
  const cursorPy = handActive ? app.gestures.cursor.y : window.innerHeight * 0.5;

  let best = null, bestDist = CONFIG.focus.maxDistPx;

  for (const n of NODES) {
    const el = document.querySelector(`.node[data-id="${n.id}"]`);
    const p = app.field.projectAnchor(n.id);
    if (!el || !p) continue;
    if (p.behind) { el.style.opacity = 0; continue; }
    const par = -focusX * 26 * (n.anchor.z / 3.4);
    const x = p.x + par;
    el.style.transform =
      `translate(-50%, -50%) translate3d(${x}px, ${p.y}px, 0) scale(${p.scale})`;
    el.style.opacity = '';
    app.nodePos.set(n.id, { x, y: p.y });

    const d = handActive
      ? Math.hypot(x - cursorPx, p.y - cursorPy)
      : Math.abs(x - cursorPx);
    if (d < bestDist) { bestDist = d; best = n.id; }
  }

  if (best !== app.focusedId) {
    app.focusedId = best;
    app.hold.p = 0;
    for (const el of document.querySelectorAll('.node')) {
      el.classList.toggle('focus', el.dataset.id === best);
    }
  }
}

// dwell-to-open: hold an open hand (or a pointing finger) on a node
function updateHold(dt, now) {
  const g = app.gestures;
  const chargeable =
    app.state === 'present' && !app.spaceId && g.active &&
    (g.mode === 'palm' || g.mode === 'point' || g.mode === 'hand') &&
    g.speed < CONFIG.hold.maxSpeed &&
    app.focusedId && now > app.hold.until;

  if (chargeable) {
    if (app.hold.target !== app.focusedId) { app.hold.target = app.focusedId; app.hold.p = 0; }
    app.hold.p = Math.min(1, app.hold.p + dt * (1000 / CONFIG.hold.ms) / 1);
    if (app.hold.p >= 1) {
      const id = app.hold.target;
      app.hold.p = 0;
      openSpace(id);
    }
  } else {
    app.hold.p = Math.max(0, app.hold.p - dt * 2.4);
    if (!app.focusedId) app.hold.target = null;
  }
}

function updateCursor() {
  const g = app.gestures;
  const el = $('cursor');
  if (!g.active || app.state !== 'present') return;
  el.style.transform = `translate3d(${g.cursor.x}px, ${g.cursor.y}px, 0)`;
  const over = app.focusedId && !app.spaceId ? ' on-target' : '';
  el.className = (g.mode === 'grab' ? 'm-grab' : g.mode === 'palm' ? 'm-palm'
    : g.mode === 'point' ? 'm-point' : '') + over;
  const C = 119.4;
  el.querySelector('.c-prog').style.strokeDashoffset = String(C * (1 - app.hold.p));
}

function updateSpacePhysics(dt) {
  if (!app.spaceId) return;
  const inner = $('space-inner');

  app.scroll.max = Math.max(0, inner.scrollHeight - window.innerHeight);
  if (Math.abs(app.scroll.vel) > 5) {
    app.scroll.target = clamp(app.scroll.target + app.scroll.vel * dt, 0, app.scroll.max);
    app.scroll.vel *= Math.exp(-dt * 3.2);
  }
  app.scroll.y += (app.scroll.target - app.scroll.y) * (1 - Math.exp(-dt * 9));
  inner.style.transform = `translateY(${-app.scroll.y}px)`;

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
    s.track.style.transform = `translateX(${s.x}px)`;
  }
}

// the hand physically touches the particle fabric
function updateFieldTouch() {
  const g = app.gestures;
  if (g.active && app.state === 'present') {
    const strength = 0.35 + 0.75 * g.pinchStrength;
    app.field.setHandScreen(g.cursor.x, g.cursor.y, strength);
  } else {
    app.field.setHandScreen(null, 0, 0);
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

  setText('invite-h', UI.invite.h[lang]);
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
  if (app.gestures?.active) rows.push(T.handsOn[lang]);
  rows.push(`${Math.round(fpsE)} ${T.fps[lang]}`);
  $('telemetry').innerHTML = rows.map((r) => `<span>${r}</span>`).join('');
}

function renderDebug() {
  const el = $('debug');
  if (el.classList.contains('hidden')) return;
  const s = app.signals, g = app.gestures;
  el.textContent = [
    `state    ${app.state}${app.spaceId ? ' · space:' + app.spaceId : ''}`,
    `score    ${s.score.toFixed(3)}  frac ${s.frac.toFixed(3)}`,
    `motion   ${s.motion.toFixed(4)}  peak ${s.motionPeak.toFixed(4)}`,
    `prox     ${s.proximity.toFixed(3)}  base ${s.baseline.toFixed(3)}`,
    `head     ${s.cx.toFixed(2)} ${s.cy.toFixed(2)}`,
    `hand     ${g.active ? g.mode : '—'}  v ${Math.round(g.speed)}  pinch ${g.pinchStrength.toFixed(2)}`,
    `focus    ${app.focusedId || '—'}  hold ${app.hold.p.toFixed(2)}`,
    `infer    ${Math.round(app.engine?.inferMs || 0)}ms · ${app.device || '…'} · ${app.engine?.intervalMs}ms`,
  ].join('\n');
}

function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
