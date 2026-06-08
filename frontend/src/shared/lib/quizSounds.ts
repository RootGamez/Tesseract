/**
 * Quiz sound engine — Kahoot-style cues synthesised with the Web Audio API.
 *
 * Why synthesis instead of audio files? It ships zero binary assets, works
 * offline, has no licensing concerns, and is instant to load. If you later want
 * richer audio, drop mp3/ogg files in `public/sounds/` and swap the cue bodies
 * for `new Audio(...)` — the public API (`quizSound.correct()`, etc.) stays the
 * same, so callers never change.
 *
 * The engine is a lazily-initialised singleton: the AudioContext is only created
 * on the first cue (which must happen inside a user gesture, per browser policy)
 * and is resumed automatically if the browser suspended it.
 */

const MUTE_KEY = 'tesseract_quiz_sound_muted';

// Equal-tempered note frequencies (Hz) used by the cues.
const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, E6: 1318.51, G6: 1567.98,
} as const;

type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  type?: Wave;
  /** seconds */
  duration?: number;
  /** start offset from now, seconds */
  delay?: number;
  /** peak gain 0..1 */
  gain?: number;
  attack?: number;
  release?: number;
}

class QuizSoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private listeners = new Set<(muted: boolean) => void>();
  private lobbyTimer: ReturnType<typeof setInterval> | null = null;
  private rouletteTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    let stored = false;
    try {
      stored = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* SSR / privacy mode — default to on */
    }
    this.muted = stored;
  }

  // ── Mute state ──────────────────────────────────────────────────────────────
  isMuted() {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (muted) this.stopAll();
    this.listeners.forEach((l) => l(muted));
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  subscribe(listener: (muted: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── Engine plumbing ───────────────────────────────────────────────────────
  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Prime the audio context from a user gesture so later cues are allowed to play. */
  unlock() {
    this.ensure();
  }

  private tone({ freq, type = 'sine', duration = 0.2, delay = 0, gain = 0.3, attack = 0.005, release = 0.08 }: ToneOpts) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + attack);
    env.gain.linearRampToValueAtTime(gain, t0 + Math.max(attack, duration - release));
    env.gain.linearRampToValueAtTime(0, t0 + duration);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private slide(from: number, to: number, duration: number, type: Wave = 'sawtooth', gain = 0.25, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noiseBurst(duration = 0.18, gain = 0.18, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    src.connect(hp).connect(env).connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  private arpeggio(freqs: number[], step = 0.09, opts: Partial<ToneOpts> = {}) {
    freqs.forEach((f, i) => this.tone({ freq: f, duration: step * 1.6, delay: i * step, gain: 0.28, type: 'triangle', ...opts }));
  }

  // ── Public cues ─────────────────────────────────────────────────────────────

  /** Soft looping lobby/anticipation bed while students wait for the next question. */
  lobby() {
    if (this.muted || this.lobbyTimer) return;
    const pattern = [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.E4];
    let i = 0;
    const play = () => {
      this.tone({ freq: pattern[i % pattern.length], type: 'sine', duration: 0.4, gain: 0.07 });
      i++;
    };
    play();
    this.lobbyTimer = setInterval(play, 480);
  }

  stopLobby() {
    if (this.lobbyTimer) {
      clearInterval(this.lobbyTimer);
      this.lobbyTimer = null;
    }
  }

  /** Single countdown tick (call once per second during "get ready"). */
  countdownTick(n = 0) {
    this.tone({ freq: NOTE.A4 + n * 40, type: 'square', duration: 0.1, gain: 0.18 });
  }

  /** "Go!" — the moment the question opens. */
  go() {
    this.stopLobby();
    this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.07);
  }

  /** A player locked in an answer. */
  answerSubmit() {
    this.slide(NOTE.E5, NOTE.B5, 0.12, 'triangle', 0.22);
  }

  /** Reveal: the correct answer is shown. */
  reveal() {
    this.tone({ freq: NOTE.G4, type: 'sine', duration: 0.18, gain: 0.2 });
    this.tone({ freq: NOTE.C5, type: 'sine', duration: 0.28, gain: 0.2, delay: 0.12 });
  }

  /** This player answered correctly. */
  correct() {
    this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.08, { type: 'triangle', gain: 0.3 });
  }

  /** This player answered incorrectly. */
  wrong() {
    this.slide(NOTE.A4, NOTE.D4, 0.4, 'sawtooth', 0.22);
    this.tone({ freq: NOTE.C4, type: 'square', duration: 0.25, gain: 0.12, delay: 0.18 });
  }

  /** Time ran out before answering. */
  timeUp() {
    this.tone({ freq: NOTE.E4, type: 'square', duration: 0.16, gain: 0.2 });
    this.tone({ freq: NOTE.C4, type: 'square', duration: 0.3, gain: 0.2, delay: 0.16 });
  }

  /** Leaderboard slide whoosh. */
  leaderboard() {
    this.slide(NOTE.C4, NOTE.G5, 0.5, 'sine', 0.18);
    this.arpeggio([NOTE.G4, NOTE.C5, NOTE.E5], 0.1, { delay: 0.25 });
  }

  /** Suspense roll for the podium build-up. */
  tension(durationMs = 1600) {
    const ctx = this.ensure();
    if (!ctx) return;
    const ticks = Math.floor(durationMs / 60);
    for (let i = 0; i < ticks; i++) {
      this.noiseBurst(0.05, 0.06 + (i / ticks) * 0.08, i * 0.06);
    }
  }

  /** A podium place lands (3rd, 2nd, 1st) — pitch rises with the place. */
  podiumPlace(place: 1 | 2 | 3) {
    const map = { 3: [NOTE.C5, NOTE.E5], 2: [NOTE.E5, NOTE.G5], 1: [NOTE.G5, NOTE.C6, NOTE.E6] };
    this.noiseBurst(0.2, 0.16);
    this.arpeggio(map[place], 0.08, { gain: 0.32, type: 'triangle' });
  }

  /** Big celebratory fanfare for the winner / quiz end. */
  fanfare() {
    this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6], 0.1, { gain: 0.32, type: 'triangle' });
    this.tone({ freq: NOTE.C6, type: 'triangle', duration: 0.9, gain: 0.3, delay: 0.6 });
    this.tone({ freq: NOTE.G5, type: 'sine', duration: 0.9, gain: 0.22, delay: 0.6 });
    this.noiseBurst(0.3, 0.18, 0.6);
  }

  // ── Roulette cues ─────────────────────────────────────────────────────────────

  /** Wind-up whoosh + a clicker train that decelerates while the wheel spins. */
  rouletteStart() {
    if (this.muted) return;
    this.stopRoulette();
    this.slide(NOTE.C5, NOTE.C6, 0.28, 'sawtooth', 0.14); // wind-up
    let interval = 55;
    const tick = () => {
      this.tone({ freq: NOTE.G5, type: 'square', duration: 0.025, gain: 0.11 });
      interval = Math.min(interval * 1.07, 420);
      this.rouletteTimer = setTimeout(tick, interval);
    };
    this.rouletteTimer = setTimeout(tick, interval);
  }

  stopRoulette() {
    if (this.rouletteTimer) {
      clearTimeout(this.rouletteTimer);
      this.rouletteTimer = null;
    }
  }

  /** The wheel landed on a winner — final click + celebratory fanfare. */
  rouletteWin() {
    this.stopRoulette();
    this.tone({ freq: NOTE.C6, type: 'square', duration: 0.05, gain: 0.16 });
    this.fanfare();
  }

  stopAll() {
    this.stopLobby();
    this.stopRoulette();
  }
}

export const quizSound = new QuizSoundEngine();
