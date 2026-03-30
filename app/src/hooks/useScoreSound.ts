import { useRef, useCallback } from 'react';

type ScoreTier = 'high' | 'mid' | 'low';

function getTier(score: number): ScoreTier {
  if (score >= 7) return 'high';
  if (score >= 4) return 'mid';
  return 'low';
}

function playTone(ctx: AudioContext, tier: ScoreTier) {
  const now = ctx.currentTime;

  if (tier === 'high') {
    // Ascending two-note ding: C5 → E5
    const notes: [number, number, number][] = [[523.25, 0, 0.15], [659.25, 0.15, 0.28]];
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.3, now + start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.start(now + start);
      osc.stop(now + start + dur);
    }
  } else if (tier === 'mid') {
    // Single neutral tone: G4
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, now);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else {
    // Descending two-note sad trombone: Bb3 → G3 with pitch drop
    const notes: [number, number, number][] = [[233.08, 0, 0.22], [196, 0.2, 0.38]];
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + start);
      osc.frequency.linearRampToValueAtTime(freq * 0.88, now + start + dur);
      gain.gain.setValueAtTime(0.15, now + start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.start(now + start);
      osc.stop(now + start + dur);
    }
  }
}

export function useScoreSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const unlock = useCallback(() => {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctxRef.current) {
      ctxRef.current = new AudioCtx();
    } else if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
  }, []);

  const playScore = useCallback((score: number) => {
    if (!ctxRef.current || ctxRef.current.state === 'suspended') return;
    try {
      playTone(ctxRef.current, getTier(score));
    } catch {
      // Silently ignore audio errors — never break the game for audio
    }
  }, []);

  return { unlock, playScore };
}
