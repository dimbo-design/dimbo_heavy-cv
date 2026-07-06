// Particle field. One shader covers every state of the interface:
//   uProgress  — accretion gate: model download progress materialises the field
//   uCoherence — 0 free drift (dormant) … 1 full depth form (present)
//   uDepthA/B + uMix — temporal crossfade between the two latest depth maps
// The camera-facing depth form is mirrored so it behaves like a mirror.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const VERT = /* glsl */`
  attribute float aRand;
  uniform sampler2D uDepthA;
  uniform sampler2D uDepthB;
  uniform float uMix, uTime, uCoherence, uProgress, uAmp, uPx, uDpr;
  uniform vec2 uPlane;
  varying float vD;
  varying float vGate;
  varying float vEdge;

  void main() {
    vec2 suv = vec2(1.0 - uv.x, 1.0 - uv.y);   // mirror x, image y is top-down
    float d = mix(texture2D(uDepthA, suv).r, texture2D(uDepthB, suv).r, uMix);

    vec3 formed = vec3((uv.x - 0.5) * uPlane.x,
                       (uv.y - 0.5) * uPlane.y,
                       d * uAmp);

    float t = uTime * 0.12 + aRand * 6.28318;
    vec3 drift = vec3(
      (uv.x - 0.5) * uPlane.x * 1.3 + sin(t * 0.53 + aRand * 17.0) * 0.95,
      (uv.y - 0.5) * uPlane.y * 1.3 + cos(t * 0.41 + aRand * 11.0) * 0.75,
      (aRand - 0.5) * 5.2 + sin(t * 0.33) * 0.55
    );

    vec3 p = mix(drift, formed, uCoherence);
    p.z += sin(uTime * 0.4 + aRand * 6.28318) * 0.07 * (1.0 - uCoherence);

    vD = d;
    // accretion gate (loading) × sparsity gate (dormant field shows ~40%)
    float sparse = mix(step(fract(aRand * 7.31), 0.4), 1.0, smoothstep(0.15, 0.7, uCoherence));
    vGate = step(aRand, uProgress) * sparse;

    // soften the rectangle: fade the lattice out toward its edges
    vEdge = smoothstep(0.0, 0.07, uv.x) * smoothstep(1.0, 0.93, uv.x)
          * smoothstep(0.0, 0.09, uv.y) * smoothstep(1.0, 0.91, uv.y);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = uPx * (0.62 + 0.85 * d * uCoherence + 0.2 * (1.0 - uCoherence));
    gl_PointSize = max(size * uDpr * (13.5 / -mv.z), 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uBase, uAccent;
  uniform float uCoherence, uOpacity;
  varying float vD;
  varying float vGate;
  varying float vEdge;

  void main() {
    if (vGate < 0.5) discard;
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c);
    if (r2 > 0.25) discard;
    float soft = smoothstep(0.25, 0.02, r2);

    vec3 col = mix(uBase * 0.62, uBase, vD);
    float band = smoothstep(0.80, 0.96, vD) * uCoherence;
    col = mix(col, uAccent, band * 0.6);

    float lum = mix(0.30, mix(0.16, 0.85, vD), uCoherence);
    // when a form is present, keep exposure on it — quiet the far background
    float focusDim = mix(1.0, 0.30 + 0.70 * smoothstep(0.06, 0.45, vD), uCoherence);
    gl_FragColor = vec4(col, soft * uOpacity * lum * focusDim * vEdge);
  }
`;

function makeDepthTexture(w, h) {
  const tex = new THREE.DataTexture(new Uint8Array(w * h), w, h,
    THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export class Field {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(CONFIG.colors.bg, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov, 1, 0.1, 100);
    this.camera.position.z = CONFIG.camera.z;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.texA = makeDepthTexture(CONFIG.input.width, CONFIG.input.height);
    this.texB = makeDepthTexture(CONFIG.input.width, CONFIG.input.height);

    this.uniforms = {
      uDepthA:    { value: this.texA },
      uDepthB:    { value: this.texB },
      uMix:       { value: 0 },
      uTime:      { value: 0 },
      uCoherence: { value: 0 },
      uProgress:  { value: 0.12 },
      uAmp:       { value: CONFIG.depthAmp },
      uPx:        { value: CONFIG.pointPx },
      uDpr:       { value: this.renderer.getPixelRatio() },
      uPlane:     { value: new THREE.Vector2(CONFIG.plane.width, CONFIG.plane.height) },
      uBase:      { value: new THREE.Color(CONFIG.colors.base) },
      uAccent:    { value: new THREE.Color(CONFIG.colors.accent) },
      uOpacity:   { value: 1 },
    };

    const { cols, rows } = CONFIG.grid;
    const n = cols * rows;
    const pos = new Float32Array(n * 3);           // unused, shader computes position
    const uvs = new Float32Array(n * 2);
    const rnd = new Float32Array(n);
    let i = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, i++) {
        uvs[i * 2] = x / (cols - 1);
        uvs[i * 2 + 1] = y / (rows - 1);
        rnd[i] = Math.random();
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);

    // Anchor objects for content nodes — they inherit group rotation.
    this.anchors = new Map();

    // Eased targets
    this.tCoherence = 0;
    this.tOpacity = 1;
    this.tProgress = 0.12;
    this.rotTarget = { x: 0, y: 0 };
    this.mixRate = 1 / 120;                        // updated from inference cadence

    this._wp = new THREE.Vector3();
    this.resize();
  }

  addAnchor(id, { x, y, z }) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    this.group.add(o);
    this.anchors.set(id, o);
  }

  // Project an anchor to CSS pixels. Returns {x, y, scale, behind}.
  projectAnchor(id) {
    const o = this.anchors.get(id);
    if (!o) return null;
    o.getWorldPosition(this._wp);
    const dist = this._wp.distanceTo(this.camera.position);
    this._wp.project(this.camera);
    return {
      x: (this._wp.x * 0.5 + 0.5) * this.w,
      y: (-this._wp.y * 0.5 + 0.5) * this.h,
      scale: THREE.MathUtils.clamp(13.5 / dist, 0.75, 1.25),
      behind: this._wp.z > 1,
    };
  }

  setDepth(data, w, h, expectedIntervalMs) {
    // B becomes the old frame, A the new one; uMix eases 0 → 1 (B→A? see shader: mix(A,B,uMix))
    // Shader mixes A→B with uMix, so: B = fresh, A = previous, uMix runs 0→1.
    const prev = this.texA;
    this.texA = this.texB;
    this.texB = prev;

    let tex = this.texB;
    if (tex.image.width !== w || tex.image.height !== h) {
      tex.dispose();
      tex = makeDepthTexture(w, h);
      this.texB = tex;
    }
    this.texB.image.data.set(data);
    this.texB.image.width = w;
    this.texB.image.height = h;
    this.texB.needsUpdate = true;

    this.uniforms.uDepthA.value = this.texA;
    this.uniforms.uDepthB.value = this.texB;
    this.uniforms.uMix.value = 0;
    this.mixRate = 1 / Math.max(40, Math.min(600, expectedIntervalMs || 120));
  }

  setTargets({ coherence, opacity, progress }) {
    if (coherence !== undefined) this.tCoherence = coherence;
    if (opacity !== undefined) this.tOpacity = opacity;
    if (progress !== undefined) this.tProgress = Math.max(this.tProgress, progress);
  }

  setGaze(focusX, cy) {
    this.rotTarget.y = focusX * 0.13;
    this.rotTarget.x = (cy - 0.5) * -0.12;
  }

  frame(dt) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uMix.value = Math.min(1, u.uMix.value + dt * 1000 * this.mixRate);

    const k = 1 - Math.exp(-dt * 2.4);             // smooth approach
    u.uCoherence.value += (this.tCoherence - u.uCoherence.value) * k;
    u.uOpacity.value += (this.tOpacity - u.uOpacity.value) * k;
    u.uProgress.value += (this.tProgress - u.uProgress.value) * (1 - Math.exp(-dt * 1.2));

    const kr = 1 - Math.exp(-dt * 3.0);
    this.group.rotation.y += (this.rotTarget.y - this.group.rotation.y) * kr;
    this.group.rotation.x += (this.rotTarget.x - this.group.rotation.x) * kr;

    // Slow idle sway when nothing is happening
    this.group.rotation.z = Math.sin(u.uTime.value * 0.05) * 0.008;

    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    // Keep the plane fully in view on narrow windows
    const fit = THREE.MathUtils.clamp(this.camera.aspect / (16 / 10), 0.8, 1);
    this.camera.position.z = CONFIG.camera.z / fit;
    this.camera.updateProjectionMatrix();
  }
}
