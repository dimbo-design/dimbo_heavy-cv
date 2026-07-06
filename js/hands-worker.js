// Hand tracking worker — MediaPipe Hand Landmarker (GPU, CPU fallback).
// Receives ImageBitmaps, returns compact per-hand summaries.

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let landmarker = null;
let lastTs = 0;
let busy = false;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') init();
  else if (m.type === 'frame') detect(m.bitmap, m.t);
};

async function init() {
  try {
    const { FilesetResolver, HandLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const make = (delegate) => HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try { landmarker = await make('GPU'); }
    catch (_) { landmarker = await make('CPU'); }
    post({ type: 'ready' });
  } catch (err) {
    post({ type: 'fatal', error: String(err) });
  }
}

function detect(bitmap, t) {
  if (!landmarker || busy) { bitmap?.close?.(); return; }
  busy = true;
  try {
    const ts = Math.max(lastTs + 1, performance.now());
    lastTs = ts;
    const res = landmarker.detectForVideo(bitmap, ts);
    const hands = (res?.landmarks || []).map(summarize);
    post({ type: 'hands', hands, t });
  } catch (_) {
    post({ type: 'hands', hands: [], t });
  } finally {
    bitmap?.close?.();
    busy = false;
  }
}

// Compact geometry: palm centre, hand size, pinch distance, openness, pointing.
// All coordinates normalized to the frame, x NOT yet mirrored.
function summarize(lm) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const palm = avg(lm, [0, 5, 9, 13, 17]);
  const size = d(lm[0], lm[9]) + 1e-6;
  const pinch = d(lm[4], lm[8]) / size;
  const tips = [8, 12, 16, 20];
  const open = tips.reduce((s, i) => s + d(lm[i], palm), 0) / 4 / size;
  const idxExt = d(lm[8], palm) / size;
  const midExt = d(lm[12], palm) / size;
  return {
    palm: { x: palm.x, y: palm.y },
    index: { x: lm[8].x, y: lm[8].y },
    pinchPoint: { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 },
    size, pinch, open,
    pointing: idxExt > 1.15 && midExt < 1.0,
  };
}

function avg(lm, idx) {
  let x = 0, y = 0;
  for (const i of idx) { x += lm[i].x; y += lm[i].y; }
  return { x: x / idx.length, y: y / idx.length };
}

function post(msg) { self.postMessage(msg); }
