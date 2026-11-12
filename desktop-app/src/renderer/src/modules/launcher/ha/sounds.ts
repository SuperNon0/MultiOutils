/**
 * Sons des pop-ups Home Assistant : sons intégrés (synthétisés, sans fichier)
 * ou son personnalisé (data URL préparée par le main).
 */

interface Note {
  f: number;
  /** Début, en secondes. */
  at: number;
  /** Durée, en secondes. */
  len: number;
  type?: OscillatorType;
  /** Fréquence d'arrivée (glissando). */
  to?: number;
  gain?: number;
}

const BUILTIN: Record<string, Note[]> = {
  carillon: [
    { f: 784, at: 0, len: 0.35 },
    { f: 1047, at: 0.12, len: 0.35 }
  ],
  alerte: [
    { f: 880, at: 0, len: 0.3, type: 'square', gain: 0.5 },
    { f: 660, at: 0.16, len: 0.3, type: 'square', gain: 0.5 },
    { f: 880, at: 0.32, len: 0.3, type: 'square', gain: 0.5 },
    { f: 660, at: 0.48, len: 0.4, type: 'square', gain: 0.5 }
  ],
  cloche: [
    { f: 1318, at: 0, len: 1.4, type: 'triangle' },
    { f: 2637, at: 0, len: 0.6, gain: 0.25 }
  ],
  sonnette: [
    { f: 659, at: 0, len: 0.7, type: 'triangle' },
    { f: 523, at: 0.45, len: 0.9, type: 'triangle' }
  ],
  bulle: [{ f: 420, to: 1300, at: 0, len: 0.16 }],
  douce: [
    { f: 523, at: 0, len: 0.5, gain: 0.6 },
    { f: 659, at: 0.14, len: 0.5, gain: 0.6 },
    { f: 784, at: 0.28, len: 0.7, gain: 0.6 }
  ]
};

function synth(name: string, volume: number): void {
  const notes = BUILTIN[name] ?? BUILTIN.carillon;
  try {
    const ctx = new AudioContext();
    const peak = 0.18 * volume;
    let end = 0;
    for (const n of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = n.type ?? 'sine';
      const t0 = ctx.currentTime + n.at;
      o.frequency.setValueAtTime(n.f, t0);
      if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.len);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, peak * (n.gain ?? 1)), t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.len);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + n.len + 0.05);
      end = Math.max(end, n.at + n.len);
    }
    setTimeout(() => void ctx.close(), (end + 0.5) * 1000);
  } catch {
    // pas de son disponible : tant pis
  }
}

let current: HTMLAudioElement | null = null;

/** Joue le son d'une notification. `volume` de 0 à 100. */
export function playHaSound(opts: { soundName?: string; soundSrc?: string }, volume: number): void {
  const v = Math.max(0, Math.min(100, volume)) / 100;
  if (v === 0) return;
  if (opts.soundSrc) {
    try {
      current?.pause();
      const a = new Audio(opts.soundSrc);
      a.volume = v;
      current = a;
      void a.play().catch(() => synth('carillon', v));
    } catch {
      synth('carillon', v);
    }
    return;
  }
  synth(opts.soundName ?? 'carillon', v);
}
