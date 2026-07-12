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

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                 // heel
];
const TIPS = [4, 8, 12, 16, 20];

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
  // The being speaks the site's language: PARTICLES, not wire (the
  // owner's verdict, 12.07: the skeleton was functionally obvious but
  // scared and broke the vibe) — dots seeded along every bone, joints a
  // touch brighter, fingertips brightest. 15% smaller, folded around
  // the palm centre so the clip keeps its position.
  drawHand(lm, alpha = 1) {
    const g = this.ctx, vw = innerWidth, vh = innerHeight;
    const cx = (lm[0][0] + lm[5][0] + lm[9][0] + lm[13][0] + lm[17][0]) / 5;
    const cy = (lm[0][1] + lm[5][1] + lm[9][1] + lm[13][1] + lm[17][1]) / 5;
    const s = 0.85;
    const px = (p) => ((1 - (cx + (p[0] - cx) * s)) - 0.5) * this._gain * vw + vw / 2;
    const py = (p) => ((cy + (p[1] - cy) * s) - 0.5) * this._gain * vh + vh / 2;
    const TAU = Math.PI * 2;
    const dot = (x, y, r, a) => {
      g.beginPath(); g.arc(x, y, r * 3, 0, TAU);
      g.fillStyle = `rgba(${this._color}, ${a * 0.10})`; g.fill();
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = `rgba(${this._color}, ${a})`; g.fill();
    };
    for (let ci = 0; ci < CONNECTIONS.length; ci++) {
      const [i, j] = CONNECTIONS[ci];
      const ax = px(lm[i]), ay = py(lm[i]), bx = px(lm[j]), by = py(lm[j]);
      const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 9));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        // a deterministic breath of disorder — a straight dotted line
        // would read as wire again
        const jx = Math.sin((ci * 31 + k) * 12.9898) * 1.2;
        const jy = Math.cos((ci * 17 + k) * 78.233) * 1.2;
        dot(ax + (bx - ax) * t + jx, ay + (by - ay) * t + jy, 1.3, 0.5 * alpha);
      }
    }
    for (let i = 0; i < 21; i++) {
      dot(px(lm[i]), py(lm[i]), TIPS.includes(i) ? 2.4 : 1.8, 0.85 * alpha);
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
      for (let h = 0; h < n; h++) {
        const lm = a.hands[h].map((p, j) => [
          p[0] + (b.hands[h][j][0] - p[0]) * k,
          p[1] + (b.hands[h][j][1] - p[1]) * k,
          0,
        ]);
        this.drawHand(lm, Math.max(0, life));
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
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
      return;
    }
    if (this._dim) this._dim(false);
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
