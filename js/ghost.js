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

// the ghost's own colors (the owner, 12.07, restoring the earlier
// call): silver flesh with a bluish accent — the counter-voice to the
// form's bone-and-amber, a spirit, not the site's body
const SILVER = [201, 209, 222];
const BLUE = [93, 159, 217];
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// the shader's coloring, re-spoken: mix(base*0.62, base, vD), then the
// accent band where the flesh is closest
// vN drives the silver body's light; band [0..1] pulls toward the
// bluish accent — the caller decides where the accent lives
function tint(vN, band = 0) {
  const m = 0.62 + 0.38 * vN;
  const r = SILVER[0] * m + (BLUE[0] - SILVER[0] * m) * band;
  const g = SILVER[1] * m + (BLUE[1] - SILVER[1] * m) * band;
  const b = SILVER[2] * m + (BLUE[2] - SILVER[2] * m) * band;
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
  _onend: null, _bb: null, _off: { x: 0, y: 0 },

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
      <i class="gm-line"></i><i class="gm-line w80"></i>
      <div class="gm-lb"><div class="gm-film"><i></i><i></i><i></i></div></div>`;
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
    this._refit();
  },

  // the being plays where it was recorded — but never off the stage:
  // the smallest shift that keeps the whole gesture inside the
  // viewport (the raised gain would otherwise clip fingers at edges)
  _refit() {
    const bb = this._bb;
    this._off = { x: 0, y: 0 };
    if (!bb) return;
    const g = this._gain, vw = innerWidth, vh = innerHeight, m = 30;
    const sx0 = ((1 - bb.x1) - 0.5) * g * vw + vw / 2;
    const sx1 = ((1 - bb.x0) - 0.5) * g * vw + vw / 2;
    const sy0 = (bb.y0 - 0.5) * g * vh + vh / 2;
    const sy1 = (bb.y1 - 0.5) * g * vh + vh / 2;
    if (sx1 - sx0 >= vw - 2 * m) this._off.x = (vw - sx0 - sx1) / 2;
    else if (sx0 < m) this._off.x = m - sx0;
    else if (sx1 > vw - m) this._off.x = vw - m - sx1;
    if (sy1 - sy0 >= vh - 2 * m) this._off.y = (vh - sy0 - sy1) / 2;
    else if (sy0 < m) this._off.y = m - sy0;
    else if (sy1 > vh - m) this._off.y = vh - m - sy1;
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
        let mx = 0, mi = 0;
        for (let i = 0; i < f._u.length; i++) if (f._u[i] > mx) { mx = f._u[i]; mi = i; }
        f._max = mx;
        // where the nearest flesh lives, in camera coords — the seat
        // of the bluish accent
        f._nx = f.x + ((mi % f.w) + 0.5) / f.fw;
        f._ny = f.y + (Math.floor(mi / f.w) + 0.5) / f.fh;
      }
    }
    // background/body cutoff, adaptive to the clip's own depth range —
    // the hand is the closest thing in the crop
    const mx = Math.min(fa._max, fb._max) / 255;
    const cut = mx * 0.58;
    // the palette is relative, like the form's: whatever survives the
    // cut spans the full range, so the nearest flesh always reaches
    // the amber band (recordings sit in arbitrary absolute depths)
    const span = Math.max(0.05, mx - cut);
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
    const sx = (cx) => ((1 - cx) - 0.5) * this._gain * vw + vw / 2 + this._off.x;
    const sy = (cy) => (cy - 0.5) * this._gain * vh + vh / 2 + this._off.y;
    const xs = [sx(fa.x), sx(fa.x + fa.w / fa.fw), sx(fb.x), sx(fb.x + fb.w / fb.fw)];
    const ys = [sy(fa.y), sy(fa.y + fa.h / fa.fh), sy(fb.y), sy(fb.y + fb.h / fb.fh)];
    const bx0 = Math.max(0, Math.min(...xs)), bx1 = Math.min(vw, Math.max(...xs));
    const by0 = Math.max(0, Math.min(...ys)), by1 = Math.min(vh, Math.max(...ys));
    // radial breath around the gesture (the owner, 12.07): the crop
    // rectangle must never read as a frame — flesh dissolves into
    // transparency away from the gesture's own center. Elliptical, so
    // the fade reaches the near sides of tall or wide crops too
    const rcx = (bx0 + bx1) / 2, rcy = (by0 + by1) / 2;
    const rhw = Math.max(1, (bx1 - bx0) / 2), rhh = Math.max(1, (by1 - by0) / 2);
    // the accent glow rides the nearest point of the ahead frame,
    // lerped — one coherent bluish breath, not per-dot speckle (depth
    // noise at hand scale would shimmer)
    const gx = sx(fa._nx + (fb._nx - fa._nx) * k);
    const gy = sy(fa._ny + (fb._ny - fa._ny) * k);
    const gR = Math.max(24, Math.hypot(
      (fb.w / fb.fw) * this._gain * vw, (fb.h / fb.fh) * this._gain * vh) * 0.30);
    const STEP = 7;
    const TAU = Math.PI * 2;
    for (let y = Math.ceil(by0 / STEP) * STEP; y < by1; y += STEP) {
      const cy = (y - this._off.y - vh / 2) / (this._gain * vh) + 0.5;
      for (let x = Math.ceil(bx0 / STEP) * STEP; x < bx1; x += STEP) {
        const cx = 0.5 - (x - this._off.x - vw / 2) / (this._gain * vw);
        const va = sample(fa, cx, cy);
        const vD = va + (sample(fb, cx, cy) - va) * k;
        if (vD < cut) continue;
        // more ghost than flesh (the owner, 12.07): 76% at the heart of
        // the gesture, dissolving to nothing at the edges
        const fade = 0.76 * (1 - ss(0.55, 0.98,
          Math.hypot((x - rcx) / rhw, (y - rcy) / rhh)));
        if (fade < 0.02) continue;
        const vN = Math.min(1, (vD - cut) / span);
        const band = (1 - ss(gR * 0.25, gR, Math.hypot(x - gx, y - gy))) * 0.6;
        // the shader's own light: lum by proximity, exposure kept on
        // the near flesh (scene.js FRAG, same curves)
        const lum = (0.16 + 0.69 * vN) * (0.30 + 0.70 * ss(0.06, 0.45, vN));
        const jx = Math.sin((x * 7 + y) * 12.9898) * 1.4;
        const jy = Math.cos((x + y * 11) * 78.233) * 1.4;
        g.beginPath();
        g.arc(x + jx, y + jy, 1.1 + vN * 1.2, 0, TAU);
        g.fillStyle = `rgba(${tint(vN, band)}, ${Math.min(1, lum * 1.35) * life * fade})`;
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
    this._bb = null;
    if (this._depth) {
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const f of this._depth) {
        x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y);
        x1 = Math.max(x1, f.x + f.w / f.fw); y1 = Math.max(y1, f.y + f.h / f.fh);
      }
      this._bb = { x0, y0, x1, y1 };
    }
    this._gain = opts.gain || this._gain;
    this._loops = opts.loops ?? 1;
    this._onend = opts.onend || null;
    this._dim = opts.dim || null;
    this._sheet = { y: 0, grab: null };
    this._gal = { x: 0, grab: null, on: false };
    // the mock moves ONLY while the word is actually engaged (the
    // owner, 12.07: no chasing an illusory hand) — grab/fist states are
    // judged once, over the recorded frames, with the detector's own
    // sternness: two frames to engage, two to release.
    // act 'sheet': pinch drags the page. act 'gallery': the fist takes
    // a photo (strip cell swells into a frame), carries it through the
    // stack, and the opening palm lets it collapse back.
    this._act = opts.act || null;
    this._grabs = this._act === 'sheet' ? this._judgeGrabs(frames) : null;
    this._fists = this._act === 'gallery' ? this._judgeFists(frames) : null;
    this._t0 = performance.now() / 1000;
    this.playing = true;
    // intro: the being fades in WITH the form's light stepping back
    this.show({ mock: !!opts.mock });
    if (this._dim) this._dim(true);
    this._fit();
    // the fades live OUTSIDE the demonstration (the owner, 12.07): the
    // being arrives holding its first pose, plays the gesture at full
    // presence, and leaves holding the last — the word itself is never
    // half-transparent
    // the word is spoken slower than the hand that recorded it (the
    // owner, 12.07: 0.6 of natural speed) — a demonstration, not a race
    const INTRO = 0.45, OUTRO = 0.35, RATE = 0.6;
    const tick = () => {
      if (!this.playing) return;
      const fr = this._frames;
      const dur = fr[fr.length - 1].t - fr[0].t;
      const body = dur / RATE;
      const el = performance.now() / 1000 - this._t0;
      if (el >= INTRO + body + OUTRO) {
        if (--this._loops > 0) {
          this._t0 = performance.now() / 1000;
          this._resetSheet();
          this._raf = requestAnimationFrame(tick);
          return;
        }
        this.stop();
        return;
      }
      const life = el < INTRO ? ss(0, 1, el / INTRO)
        : el > INTRO + body ? ss(0, 1, 1 - (el - INTRO - body) / OUTRO) : 1;
      const t = fr[0].t + Math.min(dur, Math.max(0, (el - INTRO) * RATE));
      let i = fr.findIndex((f) => f.t > t);
      if (i === -1) i = fr.length - 1;
      if (i === 0) i = 1;
      this.ctx.clearRect(0, 0, innerWidth, innerHeight);
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
      else if (this._fists) this._followGallery(i - 1);
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

  // fist states over the recorded frames, hands.js geometry: open =
  // mean fingertip-to-palm reach over hand size. The owner's clip
  // separates cleanly (palm 1.09–1.29, fist 0.17–0.28) — thresholds
  // sit in the gap with room to spare
  _judgeFists(frames) {
    const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    let fist = false, below = 0, above = 0;
    return frames.map((f) => {
      const lm = f.hands[0];
      if (!lm) { below = 0; above = 0; return { fist, x: 0 }; }
      let px = 0, py = 0;
      for (const i of [0, 5, 9, 13, 17]) { px += lm[i][0]; py += lm[i][1]; }
      const palm = [px / 5, py / 5];
      const size = d(lm[0], lm[9]) + 1e-6;
      const open = [8, 12, 16, 20].reduce((s, i) => s + d(lm[i], palm), 0) / 4 / size;
      below = open < 0.55 ? below + 1 : 0;
      above = open > 0.90 ? above + 1 : 0;
      if (!fist && below >= 2) fist = true;
      else if (fist && above >= 2) fist = false;
      return { fist, x: palm[0] };
    });
  },

  // the gallery act: clench — a strip cell swells into the big frame;
  // the held fist carries the stack under it (the site's own fist
  // slider); the opening palm collapses the frame back into the strip
  _followGallery(fi) {
    const st = this._fists[fi];
    const gal = this._gal;
    if (st.fist) {
      if (!gal.on) {
        gal.on = true;
        this.mock.classList.add('lb-on');
      }
      if (!gal.grab) gal.grab = { x0: st.x, s0: gal.x };
      const film = this.mock.querySelector('.gm-film');
      const w = film ? film.clientWidth : 0;
      // mirrored, weighted like the real slider — the stack follows
      const dx = -(st.x - gal.grab.x0) * this._gain * innerWidth * 0.55;
      gal.x = Math.max(-(2 * (w + 16)), Math.min(0, gal.grab.s0 + dx));
      if (film) film.style.transform = `translateX(${gal.x}px)`;
    } else {
      gal.grab = null;
      if (gal.on) {
        gal.on = false;
        this.mock.classList.remove('lb-on');
      }
    }
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
    this._gal = { x: 0, grab: null, on: false };
    if (!this.mock) return;
    this.mock.style.transition = 'opacity 0.7s, transform 0.6s cubic-bezier(0.22, 0.61, 0.36, 1)';
    this.mock.style.transform = 'translateY(-50%)';
    this.mock.classList.remove('lb-on');
    const film = this.mock.querySelector('.gm-film');
    if (film) film.style.transform = 'translateX(0)';
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
