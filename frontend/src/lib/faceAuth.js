// Face authentication helpers backed by @vladmandic/face-api (TensorFlow.js).
// Runs fully in-browser. Models live at /models/ (served from public/).
// Enrollment descriptors are stored in localStorage keyed by email.

import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "/models";
const STORAGE_KEY = "jadehaul.face.enrollments.v1";
// 0.6 is library default. Lower = stricter. 0.5 is a safer match cut-off.
export const MATCH_THRESHOLD = 0.5;

let modelsReady = false;
let modelsLoading = null;

export async function loadModels() {
  if (modelsReady) return;
  if (modelsLoading) return modelsLoading;
  modelsLoading = (async () => {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsReady = true;
  })();
  return modelsLoading;
}

// Detect a single face + descriptor from a video element.
// Returns { descriptor: Float32Array, landmarks } or null.
export async function detectFace(videoEl) {
  if (!videoEl || videoEl.readyState < 2) return null;
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 });
  const result = await faceapi
    .detectSingleFace(videoEl, opts)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result || null;
}

// Eye Aspect Ratio — small value = eyes closed. Used for blink liveness.
// Landmark indexes per face-api 68-point model:
//   left eye: 36-41, right eye: 42-47
function eyeAspectRatio(landmarks) {
  const pts = landmarks.positions;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ear = (e) => (dist(pts[e[1]], pts[e[5]]) + dist(pts[e[2]], pts[e[4]])) / (2 * dist(pts[e[0]], pts[e[3]]));
  const left = ear([36, 37, 38, 39, 40, 41]);
  const right = ear([42, 43, 44, 45, 46, 47]);
  return (left + right) / 2;
}

// Returns the EAR value for the current frame, or null if no face.
export async function currentEAR(videoEl) {
  const det = await detectFace(videoEl);
  if (!det) return { ear: null, descriptor: null };
  return { ear: eyeAspectRatio(det.landmarks), descriptor: det.descriptor };
}

// Euclidean distance between two 128-d descriptors.
export function descriptorDistance(a, b) {
  return faceapi.euclideanDistance(a, b);
}

// Average multiple descriptors element-wise into a single Float32Array.
export function averageDescriptors(list) {
  if (!list.length) return null;
  const out = new Float32Array(list[0].length);
  for (const d of list) {
    for (let i = 0; i < d.length; i++) out[i] += d[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= list.length;
  return out;
}

// localStorage I/O ---------------------------------------------------------
function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

export function saveEnrollment(email, descriptor, meta = {}) {
  const store = readStore();
  store[email.toLowerCase().trim()] = {
    descriptor: Array.from(descriptor),
    enrolled_at: new Date().toISOString(),
    ...meta,
  };
  writeStore(store);
}

export function getEnrollment(email) {
  const entry = readStore()[email.toLowerCase().trim()];
  if (!entry) return null;
  return { ...entry, descriptor: new Float32Array(entry.descriptor) };
}

export function listEnrollments() {
  const store = readStore();
  return Object.entries(store).map(([email, v]) => ({
    email,
    descriptor: new Float32Array(v.descriptor),
    enrolled_at: v.enrolled_at,
    name: v.name,
    role: v.role,
  }));
}

export function removeEnrollment(email) {
  const store = readStore();
  delete store[email.toLowerCase().trim()];
  writeStore(store);
}

// Snapshot the current webcam frame as a compressed JPEG data-url.
// Used as the driver's avatar in the app header.
export function snapshotFace(videoEl, size = 256) {
  if (!videoEl || videoEl.readyState < 2) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  // Cover-crop from center of the video frame
  const vw = videoEl.videoWidth || 640;
  const vh = videoEl.videoHeight || 480;
  const s = Math.min(vw, vh);
  const sx = (vw - s) / 2;
  const sy = (vh - s) / 2;
  ctx.save();
  // mirror to match preview
  ctx.translate(size, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, sx, sy, s, s, 0, 0, size, size);
  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.82);
}

// Best match across all enrolled descriptors. Returns { email, distance } or null.
export function findBestMatch(descriptor) {
  const items = listEnrollments();
  if (!items.length) return null;
  let best = null;
  for (const item of items) {
    const d = descriptorDistance(descriptor, item.descriptor);
    if (best === null || d < best.distance) best = { ...item, distance: d };
  }
  if (!best || best.distance > MATCH_THRESHOLD) return null;
  return best;
}
