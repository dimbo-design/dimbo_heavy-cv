// Orchestrator: state machine, presence signals, DOM choreography.
//
// States: boot → (invite) → watching ⇄ present · panel
//                ↘ denied / failed          mobile is a separate early exit.

import { CONFIG } from './config.js';
import { NODES, UI } from './content.js';
import { Field } from './scene.js';
import { DepthEngine } from './depth.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- environment

const isMobile =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && !matchMedia('(pointer: fine)').matches) ||
  Math.min(screen.width, screen.height) < 700;

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
    this._enterAt = null;
    this._exitAt = null;
    this._leanAt = null;
    this._closeAt = null;
    this.lastLeanEnd = 0;
  }

  feed(stats, now) {
    const c = this.cfg;
    // compactness of the near blob → person-likeness score
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

    // -- presence hysteresis
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

    // -- lean in / lean back (panel open/close intent)
    if (this.present) {
      if (!this.panelOpen) {
        // slow-follow baseline while browsing
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
  panelId: null,
  focusedId: null,
  nodesShown: false,
  cameraOn: false,
  modelReady: false,
  device: null,
  loadP: 0,
  fps: 0,
  presentSince: 0,
};

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
  const signals = new Signals(CONFIG.presence);
  app.field = field; app.engine = engine; app.signals = signals;

  for (const n of NODES) field.addAnchor(n.id, n.anchor);
  buildNodes();

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

  signals.onPresence = (on) => on ? enterPresent() : leavePresent();
  signals.onLeanIn = () => { if (app.focusedId && !app.panelId) openPanel(app.focusedId); };
  signals.onLeanBack = () => closePanel('lean');

  engine.initWorker();

  // Invite → camera
  $('invite-action').addEventListener('click', requestCamera);
  $('denied-action').addEventListener('click', requestCamera);

  window.addEventListener('resize', () => field.resize());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel('esc');
    if (e.key === 'd' && e.altKey) $('debug').classList.toggle('hidden');
  });
  // click outside panel closes it (silent affordance, never advertised)
  document.addEventListener('click', (e) => {
    if (app.panelId && !$('panel').contains(e.target) &&
        !e.target.closest('.node') && !e.target.closest('#lang')) {
      closePanel('click');
    }
  });

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
  setTimeout(() => {
    if (app.state === 'present') document.body.classList.add('named');
  }, CONFIG.reveal.nameMs);
}

function leavePresent() {
  app.state = 'watching';
  app.nodesShown = false;
  app.field.setTargets({ coherence: CONFIG.coherence.watching });
  document.body.classList.remove('named', 'nodes-on');
  closePanel('away');
  for (const el of document.querySelectorAll('.node')) el.classList.remove('shown', 'focus');
  app.focusedId = null;
}

// ---------------------------------------------------------------- nodes & panel

function buildNodes() {
  const wrap = $('nodes');
  wrap.innerHTML = '';
  for (const n of NODES) {
    const el = document.createElement('button');
    el.className = 'node';
    el.dataset.id = n.id;
    el.innerHTML = `<span class="n-label"></span><span class="n-sub"></span>`;
    el.addEventListener('click', () => openPanel(n.id));
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
  const els = document.querySelectorAll('.node');
  els.forEach((el, i) => {
    setTimeout(() => { if (app.nodesShown) el.classList.add('shown'); }, i * CONFIG.reveal.stagger);
  });
}

function openPanel(id) {
  const node = NODES.find((n) => n.id === id);
  if (!node || app.panelId === id) return;
  app.panelId = id;
  app.signals.panelOpen = true;
  app.signals.openBaseline = app.signals.baseline;
  const c = node.panel[lang];
  $('panel-inner').innerHTML =
    `<p class="kicker">${c.kicker}</p><h2>${c.title}</h2>${c.html}`;
  $('panel').scrollTop = 0;
  document.body.classList.add('panel-open');
}

function closePanel() {
  if (!app.panelId) return;
  app.panelId = null;
  app.signals.panelOpen = false;
  app.signals.lastLeanEnd = performance.now();
  document.body.classList.remove('panel-open');
}

// ---------------------------------------------------------------- render loop

let lastT = performance.now();
let lastTele = 0;
let fpsE = 0;

function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  fpsE = fpsE ? fpsE * 0.95 + (1 / dt) * 0.05 : 60;

  const { field, signals } = app;

  // gaze follows the visitor; idle when nobody
  if (app.state === 'present') {
    const focusX = clamp((signals.cx - 0.5) * 2 * CONFIG.focus.gain, -1.6, 1.6);
    field.setGaze(focusX * 0.5, signals.cy);
    if (!app.nodesShown && t - app.presentSince > CONFIG.reveal.nodesMs) revealNodes();
    if (app.nodesShown) updateNodes(focusX);
  } else {
    field.setGaze(Math.sin(t * 0.00013) * 0.25, 0.5);
  }

  field.frame(dt);

  if (t - lastTele > 500) { lastTele = t; renderTelemetry(); renderDebug(); }
  requestAnimationFrame(loop);
}

function updateNodes(focusX) {
  // focus cursor in px
  const cursorPx = window.innerWidth * (0.5 + 0.5 * clamp(focusX, -1, 1) * 0.8);
  let best = null, bestDist = CONFIG.focus.maxDistPx;

  for (const n of NODES) {
    const el = document.querySelector(`.node[data-id="${n.id}"]`);
    const p = app.field.projectAnchor(n.id);
    if (!el || !p) continue;
    if (p.behind) { el.style.opacity = 0; continue; }
    // parallax: labels drift opposite to focus, deeper labels drift more
    const par = -focusX * 26 * (n.anchor.z / 3.4);
    el.style.transform =
      `translate(-50%, -50%) translate3d(${p.x + par}px, ${p.y}px, 0) scale(${p.scale})`;
    el.style.opacity = '';
    const d = Math.abs(p.x + par - cursorPx);
    if (d < bestDist) { bestDist = d; best = n.id; }
  }

  if (best !== app.focusedId) {
    app.focusedId = best;
    for (const el of document.querySelectorAll('.node')) {
      el.classList.toggle('focus', el.dataset.id === best);
    }
  }
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
  if (app.panelId) {
    const id = app.panelId;
    app.panelId = null;
    openPanel(id);
  }
}

function renderTelemetry() {
  const T = UI.telemetry;
  const eye = app.cameraOn ? T.eyeOn[lang] : T.eyeOff[lang];
  let mind;
  if (app.state === 'failed') mind = '—';
  else if (!app.modelReady) mind = `${T.mindLoad[lang]} · ${Math.round(app.loadP * 100)}%`;
  else mind = app.device === 'webgpu' ? T.mindGpu[lang] : T.mindCpu[lang];
  $('telemetry').innerHTML =
    `<span>${eye}</span><span>${mind}</span><span>${Math.round(fpsE)} ${T.fps[lang]}</span>`;
}

function renderDebug() {
  const el = $('debug');
  if (el.classList.contains('hidden')) return;
  const s = app.signals;
  el.textContent = [
    `state    ${app.state}${app.panelId ? ' · panel:' + app.panelId : ''}`,
    `score    ${s.score.toFixed(3)}`,
    `frac     ${s.frac.toFixed(3)}`,
    `motion   ${s.motion.toFixed(4)}  peak ${s.motionPeak.toFixed(4)}`,
    `prox     ${s.proximity.toFixed(3)}  base ${s.baseline.toFixed(3)}`,
    `cx cy    ${s.cx.toFixed(2)} ${s.cy.toFixed(2)}`,
    `focus    ${app.focusedId || '—'}`,
    `infer    ${Math.round(app.engine?.inferMs || 0)}ms · ${app.device || '…'}`,
  ].join('\n');
}

function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
