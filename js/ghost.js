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

  hide() {
    if (!this.stage) return;
    this.stage.classList.remove('on', 'mock-on');
    this.stop();
  },

  // one skeleton, camera-frame landmarks → screen via the gestures mapping
  drawHand(lm, alpha = 1) {
    const g = this.ctx, vw = innerWidth, vh = innerHeight;
    const px = (p) => ((1 - p[0]) - 0.5) * this._gain * vw + vw / 2;
    const py = (p) => (p[1] - 0.5) * this._gain * vh + vh / 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // a soft halo first, the crisp bone on top — reads as light, not wire
    for (const [w, a] of [[7, 0.16 * alpha], [1.6, 0.85 * alpha]]) {
      g.lineWidth = w;
      g.strokeStyle = `rgba(${this._color}, ${a})`;
      g.beginPath();
      for (const [i, j] of CONNECTIONS) {
        g.moveTo(px(lm[i]), py(lm[i]));
        g.lineTo(px(lm[j]), py(lm[j]));
      }
      g.stroke();
    }
    g.fillStyle = `rgba(${this._color}, ${0.9 * alpha})`;
    for (const i of TIPS) {
      g.beginPath();
      g.arc(px(lm[i]), py(lm[i]), 2.6, 0, Math.PI * 2);
      g.fill();
    }
  },

  // replay a ⌥G trace. opts: gain (take app.gestures.gain), loops,
  // onend, mock (show the sheet skeleton behind the hand)
  play(frames, opts = {}) {
    if (!frames || frames.length < 2 || !this.stage) return;
    this.stop();
    this._frames = frames;
    this._gain = opts.gain || this._gain;
    this._loops = opts.loops ?? 1;
    this._onend = opts.onend || null;
    this._t0 = performance.now() / 1000 - frames[0].t;
    this.playing = true;
    this.show({ mock: !!opts.mock });
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
        const done = this._onend;
        this.hide();
        if (done) done();
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

  stop() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this.ctx) this.ctx.clearRect(0, 0, innerWidth, innerHeight);
  },
};
