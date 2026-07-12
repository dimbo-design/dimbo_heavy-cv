// The ghost teacher: the owner's recorded hand replayed over the content
// as a SEPARATE BEING — not the form's glow (that was an effect, not an
// actor). A full skeleton in the counter-color (the cinema teal against
// the site's amber), born on a struggle trigger, dying on the word's
// first real success.
//
// This file is the STAGE ONLY: the layer, the hand renderer, the trace
// player and the mock sheet (a see-through skeleton of a chapter — real
// enough to demonstrate on, unreal enough to be mistaken for content).
// Triggers, the death book and the real clips come later, once the owner
// records them (⌥G in the debug layer).
//
// Trace format (what ⌥G copies): [{t, hands: [[[x,y,z]×21]…]}], camera
// frame coords, x not yet mirrored — the same mapping gestures use.

const FINGERS = [
  [1, 2, 3, 4],        // thumb
  [5, 6, 7, 8],        // index
  [9, 10, 11, 12],     // middle
  [13, 14, 15, 16],    // ring
  [17, 18, 19, 20],    // pinky
];
const PALM = [0, 1, 5, 9, 13, 17];

export const ghost = {
  stage: null, canvas: null, ctx: null, mock: null,
  playing: false,
  _raf: 0, _frames: null, _t0: 0, _loops: 1, _gain: 1.3, _onend: null,
  _color: '93, 159, 217',

  mount() {
    if (this.stage) return;
    const st = document.createElement('div');
    st.id = 'ghost-stage';
    st.setAttribute('aria-hidden', 'true');
    const mock = document.createElement('div');
    mock.id = 'ghost-mock';
    mock.innerHTML = `
      <i class="gm-kicker"></i>
      <i class="gm-title"></i>
      <i class="gm-line"></i><i class="gm-line"></i><i class="gm-line w60"></i>
      <div class="gm-strip"><i></i><i></i><i></i></div>
      <i class="gm-line"></i><i class="gm-line w80"></i>`;
    const cv = document.createElement('canvas');
    cv.id = 'ghost-hand';
    st.append(mock, cv);
    document.body.appendChild(st);
    this.stage = st;
    this.canvas = cv;
    this.ctx = cv.getContext('2d');
    this.mock = mock;
    const c = getComputedStyle(document.documentElement)
      .getPropertyValue('--ghost-rgb').trim();
    if (c) this._color = c;
  },

  // the owner's clips live as assets: ⌥G recordings, verbatim
  async load(name) {
    const r = await fetch(`assets/ghost/${name}.json`);
    if (!r.ok) throw new Error(`no such clip: ${name}`);
    return r.json();
  },

  _fit() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(innerWidth * dpr)) {
      this.canvas.width = Math.round(innerWidth * dpr);
      this.canvas.height = Math.round(innerHeight * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  show({ mock = false } = {}) {
    if (!this.stage) return;
    this.stage.classList.add('on');
    this.stage.classList.toggle('mock-on', mock);
  },

  hide() { this.stop(true); },   // instant blackout, no choreography

  // one hand, camera-frame landmarks → screen via the gestures mapping.
  // The being is drawn the way the SITE draws a person (the owner's
  // verdict, 12.07: dotted bones were still wire — he asked for the 3D
  // form's own preview style): a filled silhouette sampled into a fixed
  // screen lattice of particles. A mask canvas gets the hand's solid
  // shape — palm polygon plus finger capsules — and the lattice lights
  // up wherever the mask is inked, with the glyph relief's swell and
  // grain so the dots vary the way the form's do. 15% smaller, folded
  // around the palm centre so the clip keeps its position.
  drawHand(lm, alpha = 1) {
    const g = this.ctx, vw = innerWidth, vh = innerHeight;
    const cx = (lm[0][0] + lm[5][0] + lm[9][0] + lm[13][0] + lm[17][0]) / 5;
    const cy = (lm[0][1] + lm[5][1] + lm[9][1] + lm[13][1] + lm[17][1]) / 5;
    const s = 0.85;
    const px = (p) => ((1 - (cx + (p[0] - cx) * s + this._dx)) - 0.5) * this._gain * vw + vw / 2;
    const py = (p) => ((cy + (p[1] - cy) * s) - 0.5) * this._gain * vh + vh / 2;

    // ---- the mask: half-resolution, hand shape as solid ink
    if (!this._mask) {
      this._mask = document.createElement('canvas');
      this._mctx = this._mask.getContext('2d', { willReadFrequently: true });
    }
    const M = 0.5;
    const mw = Math.round(vw * M), mh = Math.round(vh * M);
    if (this._mask.width !== mw) { this._mask.width = mw; this._mask.height = mh; }
    const m = this._mctx;
    m.setTransform(M, 0, 0, M, 0, 0);
    m.clearRect(0, 0, vw, vh);
    m.fillStyle = '#fff';
    m.strokeStyle = '#fff';
    m.lineCap = 'round';
    m.lineJoin = 'round';
    const P = (i) => [px(lm[i]), py(lm[i])];
    // the palm: polygon through wrist and knuckles
    m.beginPath();
    PALM.forEach((i, k) => { const [x, y] = P(i); k ? m.lineTo(x, y) : m.moveTo(x, y); });
    m.closePath();
    m.fill();
    // fingers: capsules, width scaled to the knuckle span
    const [k5x, k5y] = P(5), [k17x, k17y] = P(17);
    const span = Math.hypot(k17x - k5x, k17y - k5y);
    m.lineWidth = Math.max(8, span * 0.30);
    for (const chain of FINGERS) {
      m.beginPath();
      chain.forEach((i, k) => { const [x, y] = P(i); k ? m.lineTo(x, y) : m.moveTo(x, y); });
      m.stroke();
    }
    // the heel: round out the wrist
    m.lineWidth = Math.max(10, span * 0.5);
    m.beginPath();
    const [wx, wy] = P(0);
    m.moveTo(wx, wy);
    m.lineTo((k5x + k17x) / 2, (k5y + k17y) / 2);
    m.stroke();

    // ---- the lattice: fixed to the screen like the form's grid
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let i = 0; i < 21; i++) {
      const [x, y] = P(i);
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x);
      by0 = Math.min(by0, y); by1 = Math.max(by1, y);
    }
    const pad = Math.max(16, span * 0.4);
    bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad);
    bx1 = Math.min(vw, bx1 + pad); by1 = Math.min(vh, by1 + pad);
    if (bx1 <= bx0 || by1 <= by0) return;
    const img = m.getImageData(
      Math.floor(bx0 * M), Math.floor(by0 * M),
      Math.max(1, Math.ceil((bx1 - bx0) * M)), Math.max(1, Math.ceil((by1 - by0) * M)));
    const STEP = 7;
    const TAU = Math.PI * 2;
    for (let y = Math.ceil(by0 / STEP) * STEP; y < by1; y += STEP) {
      for (let x = Math.ceil(bx0 / STEP) * STEP; x < bx1; x += STEP) {
        const ix = Math.floor((x - bx0) * M), iy = Math.floor((y - by0) * M);
        const a = img.data[(iy * img.width + ix) * 4 + 3] / 255;
        if (a < 0.25) continue;
        // the glyph's relief: a slow swell plus fine grain — the dots
        // vary the way a body's do (scene.js showGlyph, same recipe)
        const swell = Math.sin(x * 0.23 + y * 0.31) * 0.16;
        const grain = ((x * 73 + y * 149) % 13) / 12 * 0.34;
        const lum = (0.50 + swell + grain) * a * alpha;
        const jx = Math.sin((x * 7 + y) * 12.9898) * 1.4;
        const jy = Math.cos((x + y * 11) * 78.233) * 1.4;
        g.beginPath();
        g.arc(x + jx, y + jy, 1.25 + a * 0.85, 0, TAU);
        g.fillStyle = `rgba(${this._color}, ${lum})`;
        g.fill();
      }
    }
  },

  // replay a ⌥G trace. opts: gain (take app.gestures.gain), loops,
  // onend, mock (show the sheet skeleton behind the hand), dim (a
  // callback (on) => … that yields the stage light — main wires it to
  // field.setTeachDim so this module never imports the scene)
  play(frames, opts = {}) {
    if (!frames || frames.length < 2 || !this.stage) return;
    this.stop(true);
    this._frames = frames;
    this._gain = opts.gain || this._gain;
    this._loops = opts.loops ?? 1;
    this._onend = opts.onend || null;
    this._dim = opts.dim || null;
    this._follow = !!opts.follow;
    this._sheet = { y: 0, grab: null };
    // anchor: shift the whole clip so the hand plays OVER the sheet —
    // the clips were recorded over a right-side chapter, the mock sits
    // left, and a hint pointing at empty space teaches nothing
    this._dx = 0;
    if (opts.anchorX != null) {
      let sum = 0, n = 0;
      for (const f of frames) if (f.hands[0]) { sum += f.hands[0][9][0]; n++; }
      const cur = ((1 - sum / n) - 0.5) * this._gain * innerWidth + innerWidth / 2;
      this._dx = -(opts.anchorX - cur) / (this._gain * innerWidth);
    }
    this._t0 = performance.now() / 1000 - frames[0].t;
    this.playing = true;
    // intro: the being fades in WITH the form's light stepping back
    this.show({ mock: !!opts.mock });
    if (this._dim) this._dim(true);
    this._fit();
    const tick = () => {
      if (!this.playing) return;
      const t = performance.now() / 1000 - this._t0;
      const fr = this._frames;
      let i = fr.findIndex((f) => f.t > t);
      if (i === -1) {
        if (--this._loops > 0) {
          this._t0 = performance.now() / 1000 - fr[0].t;
          this._resetSheet();
          this._raf = requestAnimationFrame(tick);
          return;
        }
        this.stop();
        return;
      }
      if (i === 0) i = 1;
      const a = fr[i - 1], b = fr[i];
      const k = (t - a.t) / Math.max(1e-3, b.t - a.t);
      this.ctx.clearRect(0, 0, innerWidth, innerHeight);
      // ease in and out of the clip so the being appears, not pops
      const life = Math.min(1, (t - fr[0].t) / 0.5,
        (fr[fr.length - 1].t - t) / 0.5 + 0.001);
      const n = Math.min(a.hands.length, b.hands.length);
      let first = null;
      for (let h = 0; h < n; h++) {
        const lm = a.hands[h].map((p, j) => [
          p[0] + (b.hands[h][j][0] - p[0]) * k,
          p[1] + (b.hands[h][j][1] - p[1]) * k,
          p[2] + (b.hands[h][j][2] - p[2]) * k,
        ]);
        if (!first) first = lm;
        this.drawHand(lm, Math.max(0, life));
      }
      if (this._follow && first) this._followSheet(first);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },

  // the demonstration's whole point (the owner, 12.07): the mock sheet
  // BEHAVES — while the ghost pinches, the sheet rides its hand exactly
  // the way a chapter rides a real pinch. Pinch is read off the clip
  // with the same geometry hands.js uses, hysteresis 0.30/0.45.
  _followSheet(lm) {
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const pinch = d(lm[4], lm[8]) / Math.max(1e-4, d(lm[0], lm[9]));
    const handY = (lm[4][1] + lm[8][1]) / 2;
    const sh = this._sheet;
    if (!sh.grab && pinch < 0.30) sh.grab = { y0: handY, s0: sh.y };
    else if (sh.grab && pinch > 0.45) sh.grab = null;
    if (!sh.grab) return;
    const dy = (handY - sh.grab.y0) * this._gain * innerHeight;
    sh.y = Math.max(-innerHeight * 0.35,
      Math.min(innerHeight * 0.35, sh.grab.s0 + dy));
    this.mock.style.transition = 'opacity 0.7s, transform 0s';
    this.mock.style.transform = `translateY(calc(-50% + ${sh.y}px))`;
  },

  _resetSheet() {
    this._sheet = { y: 0, grab: null };
    if (!this.mock) return;
    this.mock.style.transition = 'opacity 0.7s, transform 0.6s cubic-bezier(0.22, 0.61, 0.36, 1)';
    this.mock.style.transform = 'translateY(-50%)';
  },

  // outro (and any interrupt): the hint leaves twice as fast as it came,
  // the form's light straightens back slowly (setTeachDim's own rate).
  // quiet=true skips the choreography — a restart's internal cleanup.
  stop(quiet = false) {
    const wasPlaying = this.playing;
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (!this.stage) return;
    if (quiet || !wasPlaying) {
      this.stage.classList.remove('on', 'mock-on', 'fast');
      if (this.ctx) this.ctx.clearRect(0, 0, innerWidth, innerHeight);
      this._resetSheet();
      return;
    }
    if (this._dim) this._dim(false);
    this._resetSheet();
    this.stage.classList.add('fast');
    this.stage.classList.remove('on', 'mock-on');
    const done = this._onend;
    this._onend = null;
    setTimeout(() => {
      if (this.ctx) this.ctx.clearRect(0, 0, innerWidth, innerHeight);
      this.stage.classList.remove('fast');
    }, 420);
    if (done) done();
  },
};
