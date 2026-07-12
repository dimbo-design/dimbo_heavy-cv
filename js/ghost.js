// The ghost teacher: the owner's recorded hand replayed over the content
// as a SEPARATE BEING — not the form's glow (that was an effect, not an
// actor). Born on a struggle trigger, dying on the word's first real
// success.
//
// THE LAW OF THIS FILE (the owner, 12.07): the hint must be CONSISTENT
// with the site — made of the same flesh as the form. A hand rebuilt
// from landmarks is math, not him; so the real material is the DEPTH
// stream ⌥G records alongside the skeletons, replayed through the
// form's own palette (bone rising to amber with proximity, the shader's
// recipe re-spoken in 2D). The landmark mask renderer below survives
// only as a fallback for legacy clips until the owner re-records.
//
// Clip format v2 (what ⌥G copies): { hands: [{t, hands: [[[x,y,z]×21]…]}],
//   depth: [{t, x, y, w, h, fw, fh, d: base64}] } — camera frame coords,
// x not yet mirrored, the same mapping gestures use. v1 was a bare
// hands array.

const FINGERS = [
  [1, 2, 3, 4],        // thumb
  [5, 6, 7, 8],        // index
  [9, 10, 11, 12],     // middle
  [13, 14, 15, 16],    // ring
  [17, 18, 19, 20],    // pinky
];
const PALM = [0, 1, 5, 9, 13, 17];

// the form's own colors (scene.js FRAG): bone base, amber accent
const BONE = [231, 226, 213];
const AMBER = [217, 163, 93];
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// the shader's coloring, re-spoken: mix(bone*0.62, bone, vD), then the
// amber band where the flesh is closest
function tint(vD) {
  const m = 0.62 + 0.38 * vD;
  const band = ss(0.80, 0.96, vD) * 0.6;
  const r = BONE[0] * m + (AMBER[0] - BONE[0] * m) * band;
  const g = BONE[1] * m + (AMBER[1] - BONE[1] * m) * band;
  const b = BONE[2] * m + (AMBER[2] - BONE[2] * m) * band;
  return `${r | 0}, ${g | 0}, ${b | 0}`;
}

function unb64(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export const ghost = {
  stage: null, canvas: null, ctx: null, mock: null,
  playing: false,
  _raf: 0, _frames: null, _depth: null, _t0: 0, _loops: 1, _gain: 1.3,
  _onend: null,

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

  // ---- the REAL hand: two depth crops, lerped onto the fixed screen
  // lattice, colored by proximity exactly the way the form is. All the
  // recording's artifacts ride along — that is the point.
  drawDepth(fa, fb, k, life) {
    const g = this.ctx, vw = innerWidth, vh = innerHeight;
    for (const f of [fa, fb]) {
      if (!f._u) {
        f._u = unb64(f.d);
        let mx = 0;
        for (let i = 0; i < f._u.length; i++) if (f._u[i] > mx) mx = f._u[i];
        f._max = mx;
      }
    }
    // background/body cutoff, adaptive to the clip's own depth range —
    // the hand is the closest thing in the crop
    const cut = Math.min(fa._max, fb._max) / 255 * 0.58;
    const sample = (f, cx, cy) => {
      const u = (cx - f.x) * f.fw, v = (cy - f.y) * f.fh;
      if (u < 0 || v < 0 || u >= f.w - 1 || v >= f.h - 1) return 0;
      const u0 = u | 0, v0 = v | 0, fu = u - u0, fv = v - v0;
      const d = f._u, i0 = v0 * f.w + u0;
      const top = d[i0] + (d[i0 + 1] - d[i0]) * fu;
      const bot = d[i0 + f.w] + (d[i0 + f.w + 1] - d[i0 + f.w]) * fu;
      return (top + (bot - top) * fv) / 255;
    };
    // screen bbox: union of both crop rects
    const sx = (cx) => ((1 - cx) - 0.5) * this._gain * vw + vw / 2;
    const sy = (cy) => (cy - 0.5) * this._gain * vh + vh / 2;
    const xs = [sx(fa.x), sx(fa.x + fa.w / fa.fw), sx(fb.x), sx(fb.x + fb.w / fb.fw)];
    const ys = [sy(fa.y), sy(fa.y + fa.h / fa.fh), sy(fb.y), sy(fb.y + fb.h / fb.fh)];
    const bx0 = Math.max(0, Math.min(...xs)), bx1 = Math.min(vw, Math.max(...xs));
    const by0 = Math.max(0, Math.min(...ys)), by1 = Math.min(vh, Math.max(...ys));
    const STEP = 7;
    const TAU = Math.PI * 2;
    for (let y = Math.ceil(by0 / STEP) * STEP; y < by1; y += STEP) {
      const cy = (y - vh / 2) / (this._gain * vh) + 0.5;
      for (let x = Math.ceil(bx0 / STEP) * STEP; x < bx1; x += STEP) {
        const cx = 0.5 - (x - vw / 2) / (this._gain * vw);
        const va = sample(fa, cx, cy);
        const vD = va + (sample(fb, cx, cy) - va) * k;
        if (vD < cut) continue;
        // the shader's own light: lum by proximity, exposure kept on
        // the near flesh (scene.js FRAG, same curves)
        const lum = (0.16 + 0.69 * vD) * (0.30 + 0.70 * ss(0.06, 0.45, vD));
        const jx = Math.sin((x * 7 + y) * 12.9898) * 1.4;
        const jy = Math.cos((x + y * 11) * 78.233) * 1.4;
        g.beginPath();
        g.arc(x + jx, y + jy, 1.1 + vD * 1.2, 0, TAU);
        g.fillStyle = `rgba(${tint(vD)}, ${Math.min(1, lum * 1.35) * life})`;
        g.fill();
      }
    }
  },

  // ---- legacy fallback: v1 clips carry only landmarks — a filled
  // silhouette (palm polygon + finger capsules) sampled into the same
  // lattice, in the form's palette. Dies when the owner re-records.
  drawHand(lm, alpha = 1) {
    const g = this.ctx, vw = innerWidth, vh = innerHeight;
    const cx = (lm[0][0] + lm[5][0] + lm[9][0] + lm[13][0] + lm[17][0]) / 5;
    const cy = (lm[0][1] + lm[5][1] + lm[9][1] + lm[13][1] + lm[17][1]) / 5;
    const s = 0.85;
    const px = (p) => ((1 - (cx + (p[0] - cx) * s)) - 0.5) * this._gain * vw + vw / 2;
    const py = (p) => ((cy + (p[1] - cy) * s) - 0.5) * this._gain * vh + vh / 2;
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
    m.beginPath();
    PALM.forEach((i, k) => { const [x, y] = P(i); k ? m.lineTo(x, y) : m.moveTo(x, y); });
    m.closePath();
    m.fill();
    const [k5x, k5y] = P(5), [k17x, k17y] = P(17);
    const span = Math.hypot(k17x - k5x, k17y - k5y);
    m.lineWidth = Math.max(8, span * 0.30);
    for (const chain of FINGERS) {
      m.beginPath();
      chain.forEach((i, k) => { const [x, y] = P(i); k ? m.lineTo(x, y) : m.moveTo(x, y); });
      m.stroke();
    }
    m.lineWidth = Math.max(10, span * 0.5);
    m.beginPath();
    const [wx, wy] = P(0);
    m.moveTo(wx, wy);
    m.lineTo((k5x + k17x) / 2, (k5y + k17y) / 2);
    m.stroke();
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
        // no depth in a v1 clip — a flat proxy with the glyph's relief
        const swell = Math.sin(x * 0.23 + y * 0.31) * 0.12;
        const grain = ((x * 73 + y * 149) % 13) / 12 * 0.25;
        const vD = Math.min(1, 0.45 + swell + grain) * a;
        const lum = (0.16 + 0.69 * vD) * (0.30 + 0.70 * ss(0.06, 0.45, vD));
        const jx = Math.sin((x * 7 + y) * 12.9898) * 1.4;
        const jy = Math.cos((x + y * 11) * 78.233) * 1.4;
        g.beginPath();
        g.arc(x + jx, y + jy, 1.1 + vD * 1.2, 0, TAU);
        g.fillStyle = `rgba(${tint(vD)}, ${Math.min(1, lum * 1.5) * alpha})`;
        g.fill();
      }
    }
  },

  // replay a ⌥G clip (v2 object or v1 array). opts: gain (take
  // app.gestures.gain), loops, onend, mock, follow, dim — dim is a
  // callback (on) => … main wires to field.setTeachDim so this module
  // never imports the scene.
  play(clip, opts = {}) {
    const frames = Array.isArray(clip) ? clip : clip?.hands;
    if (!frames || frames.length < 2 || !this.stage) return;
    this.stop(true);
    this._frames = frames;
    this._depth = (!Array.isArray(clip) && clip.depth?.length > 1) ? clip.depth : null;
    this._gain = opts.gain || this._gain;
    this._loops = opts.loops ?? 1;
    this._onend = opts.onend || null;
    this._dim = opts.dim || null;
    this._sheet = { y: 0, grab: null };
    // the sheet moves ONLY while the word is actually engaged (the
    // owner, 12.07: no chasing an illusory hand) — grab states are
    // judged once, over the recorded frames, with the detector's own
    // sternness: two frames to engage, two to release
    this._grabs = opts.follow ? this._judgeGrabs(frames) : null;
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
      this.ctx.clearRect(0, 0, innerWidth, innerHeight);
      // ease in and out of the clip so the being appears, not pops
      const life = Math.max(0, Math.min(1, (t - fr[0].t) / 0.5,
        (fr[fr.length - 1].t - t) / 0.5 + 0.001));
      if (this._depth) {
        // the real flesh: find the surrounding depth frames by time
        const dp = this._depth;
        let j = dp.findIndex((f) => f.t > t);
        if (j === -1) j = dp.length - 1;
        if (j === 0) j = 1;
        const da = dp[j - 1], db = dp[j];
        const dk = Math.min(1, Math.max(0,
          (t - da.t) / Math.max(1e-3, db.t - da.t)));
        this.drawDepth(da, db, dk, life);
      } else {
        const a = fr[i - 1], b = fr[i];
        const k = (t - a.t) / Math.max(1e-3, b.t - a.t);
        const n = Math.min(a.hands.length, b.hands.length);
        for (let h = 0; h < n; h++) {
          const lm = a.hands[h].map((p, j) => [
            p[0] + (b.hands[h][j][0] - p[0]) * k,
            p[1] + (b.hands[h][j][1] - p[1]) * k,
            p[2] + (b.hands[h][j][2] - p[2]) * k,
          ]);
          this.drawHand(lm, life);
        }
      }
      if (this._grabs) this._followSheet(i - 1);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },

  // pinch judged over the recorded frames with hands.js geometry —
  // engage under 0.26 held two frames, release over 0.42 held two
  _judgeGrabs(frames) {
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    let grab = false, below = 0, above = 0;
    return frames.map((f) => {
      const lm = f.hands[0];
      if (!lm) { below = 0; above = 0; return { grab, y: 0 }; }
      const pinch = d(lm[4], lm[8]) / Math.max(1e-4, d(lm[0], lm[9]));
      below = pinch < 0.26 ? below + 1 : 0;
      above = pinch > 0.42 ? above + 1 : 0;
      if (!grab && below >= 2) grab = true;
      else if (grab && above >= 2) grab = false;
      return { grab, y: (lm[4][1] + lm[8][1]) / 2 };
    });
  },

  // the demonstration's whole point: the mock sheet BEHAVES — it stands
  // still until the recorded fingers close, rides the hand exactly as a
  // chapter rides a real pinch, and stops the moment they part
  _followSheet(fi) {
    const st = this._grabs[fi];
    const sh = this._sheet;
    if (!st.grab) { sh.grab = null; return; }
    if (!sh.grab) sh.grab = { y0: st.y, s0: sh.y };
    const dy = (st.y - sh.grab.y0) * this._gain * innerHeight;
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
