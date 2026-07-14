// Depth inference worker.
// Runs Depth Anything V2 Small (ONNX) via Transformers.js — WebGPU if available,
// WASM otherwise. Receives ImageBitmaps, returns a normalized uint8 depth map
// plus presence statistics computed here so the main thread stays light.

import { pipeline, RawImage, env } from '../assets/vendor/transformers/transformers.min.js';

// Step 1 — hard-local: library, ONNX model and ORT wasm all from this site's
// own origin, no remote at all. BASE handles the GitHub Pages sub-path.
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = new URL('../assets/vendor/models/', self.location).href;
env.backends.onnx.wasm.wasmPaths = new URL('../assets/vendor/ort/', self.location).href;

const MODEL = 'onnx-community/depth-anything-v2-small';

let pipe = null;
let ctx = null;
let W = 336, H = 252;
let busy = false;
let prevDepth = null;
let THR = 168;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') init(msg);
  else if (msg.type === 'frame') infer(msg.bitmap);
  else if (msg.type === 'tune') THR = msg.threshold ?? THR;
};

async function init({ gpuSize, cpuSize, threshold }) {
  THR = threshold ?? THR;
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      post({ type: 'progress', p: total ? loaded / total : 0 });
    }
  };

  let device = 'webgpu';
  try {
    if (!('gpu' in navigator)) throw new Error('no webgpu');
    pipe = await pipeline('depth-estimation', MODEL,
      { device: 'webgpu', dtype: 'fp16', progress_callback });
  } catch (_) {
    device = 'wasm';
    try {
      pipe = await pipeline('depth-estimation', MODEL,
        { device: 'wasm', dtype: 'q8', progress_callback });
    } catch (err) {
      post({ type: 'fatal', error: String(err) });
      return;
    }
  }

  const size = device === 'webgpu' ? gpuSize : cpuSize;
  W = size.width; H = size.height;

  // Shrink the processor's working resolution — full 518px is wasted on us.
  const proc = pipe.processor;
  const ip = proc?.image_processor ?? proc?.feature_extractor ?? proc;
  if (ip && ip.size) ip.size = { width: W, height: H };

  const canvas = new OffscreenCanvas(W, H);
  ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Warmup — compiles GPU shaders so the first real frame isn't a stall.
  try {
    const blank = new RawImage(new Uint8ClampedArray(W * H * 4).fill(12), W, H, 4);
    await pipe(blank);
  } catch (_) { /* warmup is best-effort */ }

  post({ type: 'ready', device, width: W, height: H });
}

async function infer(bitmap) {
  if (!pipe || !ctx || busy) { bitmap?.close?.(); return; }
  busy = true;
  try {
    ctx.drawImage(bitmap, 0, 0, W, H);
    bitmap.close();
    const im = ctx.getImageData(0, 0, W, H);
    const img = new RawImage(im.data, W, H, 4);
    const out = await pipe(img);
    const depth = out.depth;                     // RawImage, 1 channel, W×H
    const data = new Uint8Array(depth.data);   // copy → transferable
    const stats = computeStats(data, depth.width, depth.height);
    post({ type: 'depth', data, width: depth.width, height: depth.height, stats }, [data.buffer]);
  } catch (err) {
    post({ type: 'inferError', error: String(err) });
  } finally {
    busy = false;
  }
}

// Foreground blob statistics on the normalized depth map.
// frac    — share of "near" pixels
// cx, cy  — centroid of the near mask (0..1, image space, x NOT mirrored)
// spread  — normalized spatial std of the mask (blob compactness)
// motion  — mean abs diff vs previous frame
function computeStats(d, w, h) {
  const n = w * h;
  let cnt = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (d[row + x] > THR) { cnt++; sx += x; sy += y; }
    }
  }
  const frac = cnt / n;
  let cx = 0.5, cy = 0.5, spread = 1;
  if (cnt > 32) {
    cx = sx / cnt / w;
    cy = sy / cnt / h;
    let sv = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w, dy = y / h - cy;
      for (let x = 0; x < w; x++) {
        if (d[row + x] > THR) {
          const dx = x / w - cx;
          sv += dx * dx + dy * dy;
        }
      }
    }
    spread = Math.sqrt(sv / cnt);   // ~0.1 compact blob … ~0.45 spread field
  }
  let motion = 0;
  if (prevDepth && prevDepth.length === n) {
    let sum = 0, m = 0;
    for (let i = 0; i < n; i += 5) { sum += Math.abs(d[i] - prevDepth[i]); m++; }
    motion = sum / m / 255;
  }
  prevDepth = d.slice(0);
  return { frac, cx, cy, spread, motion };
}

function post(msg, transfer) { self.postMessage(msg, transfer || []); }
