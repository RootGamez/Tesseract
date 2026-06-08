import { motion } from 'framer-motion';
import { Crown, Medal, TrendingUp } from 'lucide-react';
import AnimatedNumber from '@/shared/components/AnimatedNumber';
import { cn } from '@/shared/lib/utils';
import type { LeaderboardEntry } from '../types';

interface QuizLeaderboardProps {
  entries: LeaderboardEntry[];
  highlightParticipantId?: string | null;
  title?: string;
  subtitle?: string;
  limit?: number;
  className?: string;
}

const RANK_STYLES: Record<number, { row: string; badge: string; icon: JSX.Element | null }> = {
  1: { row: 'from-amber-400/20 to-amber-500/5 border-amber-400/40', badge: 'bg-amber-400 text-amber-950', icon: <Crown className="w-4 h-4" /> },
  2: { row: 'from-slate-300/20 to-slate-400/5 border-slate-300/40', badge: 'bg-slate-300 text-slate-900', icon: <Medal className="w-4 h-4" /> },
  3: { row: 'from-orange-400/20 to-orange-500/5 border-orange-400/40', badge: 'bg-orange-400 text-orange-950', icon: <Medal className="w-4 h-4" /> },
};

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function QuizLeaderboard({
  entries,
  highlightParticipantId,
  title = 'Tabla de posiciones',
  subtitle,
  limit = 5,
  className,
}: QuizLeaderboardProps) {
  const top = entries.slice(0, limit);
  const you = highlightParticipantId
    ? entries.find((e) => e.participant_id === highlightParticipantId)
    : null;
  const youInTop = you ? top.some((e) => e.participant_id === you.participant_id) : false;
  const max = Math.max(1, ...entries.map((e) => e.points));

  return (
    <div className={cn('w-full max-w-xl mx-auto flex flex-col gap-4', className)}>
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15"
        >
          <TrendingUp className="w-4 h-4 text-amber-300" />
          <span className="text-sm font-bold tracking-wide text-white/90">{title}</span>
        </motion.div>
        {subtitle && <p className="text-white/50 text-xs mt-2">{subtitle}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {top.map((e, i) => {
          const style = RANK_STYLES[e.rank];
          const mine = e.participant_id === highlightParticipantId;
          return (
            <motion.div
              key={e.participant_id}
              layout
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12, type: 'spring', stiffness: 260, damping: 22 }}
              className={cn(
                'relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 overflow-hidden bg-gradient-to-r',
                style ? style.row : 'from-white/10 to-white/0 border-white/10',
                mine && 'ring-2 ring-white/70',
              )}
            >
              {/* progress fill */}
              <motion.div
                className="absolute inset-y-0 left-0 bg-white/5"
                initial={{ width: 0 }}
                animate={{ width: `${(e.points / max) * 100}%` }}
                transition={{ delay: i * 0.12 + 0.1, duration: 0.6 }}
              />
              <div
                className={cn(
                  'relative z-10 w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0',
                  style ? style.badge : 'bg-white/15 text-white',
                )}
              >
                {style?.icon ?? e.rank}
              </div>
              <div className="relative z-10 w-9 h-9 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {initials(e.display_name)}
              </div>
              <span className="relative z-10 flex-1 min-w-0 truncate font-bold text-white">
                {e.display_name}
                {mine && <span className="ml-2 text-[10px] font-semibold text-white/60 uppercase">tú</span>}
              </span>
              <AnimatedNumber
                value={e.points}
                className="relative z-10 font-black text-white tabular-nums text-lg shrink-0"
              />
            </motion.div>
          );
        })}
      </div>

      {/* Your standing if you're outside the top */}
      {you && !youInTop && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-3 rounded-2xl border border-white/30 bg-white/10 px-3 py-2.5 ring-2 ring-white/40"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm bg-white/20 text-white shrink-0">
            {you.rank}
          </div>
          <span className="flex-1 truncate font-bold text-white">
            {you.display_name} <span className="ml-1 text-[10px] font-semibold text-white/60 uppercase">tú</span>
          </span>
          <AnimatedNumber value={you.points} className="font-black text-white tabular-nums text-lg" />
        </motion.div>
      )}
    </div>
  );
}
