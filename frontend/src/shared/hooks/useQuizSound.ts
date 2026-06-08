import { useEffect, useState } from 'react';
import { quizSound } from '@/shared/lib/quizSounds';

/**
 * React binding for the global quiz sound engine. Returns the current mute state
 * and a toggle that also unlocks the AudioContext (so the first toggle, being a
 * user gesture, primes audio for later cues).
 */
export function useQuizSound() {
  const [muted, setMuted] = useState(quizSound.isMuted());

  useEffect(() => quizSound.subscribe(setMuted), []);

  const toggle = () => {
    const next = quizSound.toggleMuted();
    if (!next) quizSound.unlock();
  };

  return { muted, toggle, sound: quizSound };
}
