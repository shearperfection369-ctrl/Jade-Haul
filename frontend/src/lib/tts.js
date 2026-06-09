/**
 * Jade voice — OpenAI TTS Nova via /api/tts/speak.
 * Streams an mp3 blob from the backend and plays it.
 * Cancels prior playback on new call.
 */
import { api } from "@/lib/api";

let currentAudio = null;
let muted = false;

export function setMuted(v) {
  muted = !!v;
  if (muted && currentAudio) {
    try { currentAudio.pause(); } catch { /* noop */ }
  }
}

export function isMuted() {
  return muted;
}

export function stopSpeak() {
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* noop */ }
    currentAudio = null;
  }
}

export async function speak(text, opts = {}) {
  if (muted || !text || !text.trim()) return;
  stopSpeak();
  try {
    const { data } = await api.post(
      "/tts/speak",
      { text, voice: opts.voice || "nova", model: opts.model || "tts-1", speed: opts.speed || 1.0 },
      { responseType: "blob" }
    );
    const url = URL.createObjectURL(data);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onpause = () => URL.revokeObjectURL(url);
    currentAudio = audio;
    if (opts.onStart) audio.onplay = opts.onStart;
    if (opts.onEnd) audio.onended = () => { URL.revokeObjectURL(url); opts.onEnd?.(); };
    await audio.play();
  } catch (e) {
    // Fall through silently — backend may not have key configured.
    // eslint-disable-next-line no-console
    console.warn("TTS failed:", e?.message || e);
  }
}
