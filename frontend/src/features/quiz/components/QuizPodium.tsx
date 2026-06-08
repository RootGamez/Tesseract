import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Crown, Medal, RotateCcw, X, Sparkles } from 'lucide-react';
import AnimatedNumber from '@/shared/components/AnimatedNumber';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { quizSound } from '@/shared/lib/quizSounds';
import type { LeaderboardEntry } from '../types';

interface QuizPodiumProps {
  entries: LeaderboardEntry[];
  currentParticipantId?: string | null;
  onReplay?: () => void;
  onExit?: () => void;
  exitLabel?: string;
}

type Phase = 0 | 1 | 2 | 3 | 4; // 0=build, 1=3rd, 2=2nd, 3=1st, 4=done

const COLUMNS: { place: 1 | 2 | 3; order: number; height: string; podium: string; medal: string }[] = [
  { place: 2, order: 0, height: 'h-36 sm:h-48', podium: 'from-slate-300 to-slate-400', medal: 'text-slate-200' },
  { place: 1, order: 1, height: 'h-48 sm:h-64', podium: 'from-amber-300 to-amber-500', medal: 'text-amber-200' },
  { place: 3, order: 2, height: 'h-28 sm:h-40', podium: 'from-orange-400 to-orange-600', medal: 'text-orange-200' },
];

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function fireConfetti() {
  const burst = (x: number) =>
    confetti({ particleCount: 120, spread: 75, origin: { x, y: 0.6 }, startVelocity: 45, ticks: 250 });
  burst(0.5);
  setTimeout(() => burst(0.2), 150);
  setTimeout(() => burst(0.8), 300);
  const end = Date.now() + 2500;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export default function QuizPodium({ entries, currentParticipantId, onReplay, onExit, exitLabel = 'Salir' }: QuizPodiumProps) {
  const [phase, setPhase] = useState<Phase>(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const top3 = entries.slice(0, 3);
  const byPlace = (place: 1 | 2 | 3) => top3[place - 1];
  const rest = entries.slice(3);
  const you = currentParticipantId ? entries.find((e) => e.participant_id === currentParticipantId) : null;

  useEffect(() => {
    quizSound.tension(1500);
    const seq: [number, Phase][] = [
      [1600, byPlace(3) ? 1 : 2],
      [2900, byPlace(2) ? 2 : 3],
      [4200, 3],
      [4900, 4],
    ];
    seq.forEach(([ms, p]) => {
      timers.current.push(setTimeout(() => setPhase((cur) => (p > cur ? p : cur)), ms));
    });
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sound + confetti as each place lands.
  const prevPhase = useRef<Phase>(0);
  useEffect(() => {
    if (phase === prevPhase.current) return;
    if (phase === 1 && byPlace(3)) quizSound.podiumPlace(3);
    if (phase === 2 && byPlace(2)) quizSound.podiumPlace(2);
    if (phase === 3 && byPlace(1)) {
      quizSound.podiumPlace(1);
      quizSound.fanfare();
      fireConfetti();
    }
    prevPhase.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const placeVisible = (place: 1 | 2 | 3) =>
    place === 3 ? phase >= 1 : place === 2 ? phase >= 2 : phase >= 3;

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-b from-[#3a1338] via-[#461A42] to-[#1c0a1b] flex flex-col">
      {/* ambient sparkles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute text-amber-300/40"
            style={{ left: `${(i * 53) % 100}%`, top: `${(i * 31) % 100}%` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 0.8, 0], scale: [0, 1, 0], y: [0, -20] }}
            transition={{ duration: 3, repeat: Infinity, delay: (i % 6) * 0.4 }}
          >
            <Sparkles className="w-3 h-3" />
          </motion.span>
        ))}
      </div>

      {/* header + actions */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4 shrink-0">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-white text-lg sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <span>🏆</span> Resultados finales
          </h2>
        </motion.div>
        <div className="flex items-center gap-2">
          {onReplay && phase >= 4 && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={onReplay}>
              <RotateCcw className="w-3.5 h-3.5" /> Nuevo quiz
            </Button>
          )}
          {onExit && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10" onClick={onExit} title={exitLabel}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* build-up message */}
      <AnimatePresence>
        {phase === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            className="absolute inset-0 z-20 flex items-center justify-center"
          >
            <div className="text-center">
              <motion.p
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 0.7, repeat: Infinity }}
                className="text-2xl sm:text-4xl font-black text-white/90"
              >
                Y el podio es...
              </motion.p>
              <p className="text-white/40 text-sm mt-3 tracking-widest uppercase">Redoble de tambores</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* podium */}
      <div className="relative z-10 flex-1 flex items-end justify-center gap-2 sm:gap-5 px-3 pb-2 min-h-0">
        {COLUMNS.map((col) => {
          const entry = byPlace(col.place);
          const visible = entry && placeVisible(col.place);
          const mine = entry && entry.participant_id === currentParticipantId;
          return (
            <div key={col.place} className="flex flex-col items-center justify-end w-1/3 max-w-[180px]" style={{ order: col.order }}>
              <AnimatePresence>
                {visible && (
                  <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.7 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                    className="flex flex-col items-center mb-2"
                  >
                    {col.place === 1 && (
                      <motion.div
                        initial={{ y: 10, opacity: 0, rotate: -15 }}
                        animate={{ y: 0, opacity: 1, rotate: 0 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                      >
                        <Crown className="w-8 h-8 sm:w-10 sm:h-10 text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.6)]" />
                      </motion.div>
                    )}
                    <div
                      className={cn(
                        'relative w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-lg sm:text-2xl font-black text-white border-2 shadow-xl',
                        col.place === 1 ? 'bg-amber-500 border-amber-200' : col.place === 2 ? 'bg-slate-400 border-slate-200' : 'bg-orange-500 border-orange-200',
                        mine && 'ring-4 ring-white/80',
                      )}
                    >
                      {initials(entry!.display_name)}
                    </div>
                    <p className="mt-2 text-white font-bold text-xs sm:text-base text-center max-w-[120px] truncate">
                      {entry!.display_name}
                      {mine && <span className="block text-[10px] font-semibold text-amber-300 uppercase">tú</span>}
                    </p>
                    <AnimatedNumber value={entry!.points} className="text-white/80 font-black text-sm sm:text-lg tabular-nums" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* podium block */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: visible ? undefined : 0 }}
                className={cn(
                  'w-full rounded-t-xl bg-gradient-to-b flex items-start justify-center pt-2 shadow-2xl transition-all',
                  col.height,
                  col.podium,
                  !visible && 'opacity-0',
                )}
              >
                <span className="text-white/90 font-black text-2xl sm:text-4xl drop-shadow">{col.place}</span>
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* you / rest of ranking */}
      <AnimatePresence>
        {phase >= 4 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 shrink-0 px-4 pb-4 pt-2 max-h-[34%] overflow-y-auto scrollbar-thin"
          >
            {you && you.rank > 3 && (
              <div className="max-w-md mx-auto mb-3 flex items-center gap-3 rounded-xl bg-white/10 border border-white/25 px-3 py-2 ring-2 ring-white/30">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-black text-white text-sm">{you.rank}</div>
                <span className="flex-1 text-white font-bold truncate">Terminaste en el puesto #{you.rank}</span>
                <AnimatedNumber value={you.points} className="text-white font-black tabular-nums" />
              </div>
            )}
            {rest.length > 0 && (
              <div className="max-w-md mx-auto flex flex-col gap-1.5">
                {rest.map((e, i) => (
                  <motion.div
                    key={e.participant_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5',
                      e.participant_id === currentParticipantId && 'ring-2 ring-white/40',
                    )}
                  >
                    <span className="w-6 text-center text-white/50 font-bold text-sm">{e.rank}</span>
                    <span className="flex-1 text-white/90 text-sm font-medium truncate">{e.display_name}</span>
                    <span className="text-white/70 font-bold text-sm tabular-nums">{e.points.toLocaleString()}</span>
                  </motion.div>
                ))}
              </div>
            )}
            {entries.length === 0 && (
              <p className="text-center text-white/50 text-sm py-4 flex items-center justify-center gap-2">
                <Medal className="w-4 h-4" /> Aún no hay puntuaciones registradas.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
