import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, HelpCircle, Trophy, Crown, Medal, Users } from 'lucide-react';
import { quizService } from '@/shared/services/quizService';
import { cn } from '@/shared/lib/utils';
import type { Question } from '../store/useQuizStore';

interface QuizReviewProps {
  sessionId: string;
  stageId: string;
}

interface ScoreEntry {
  display_name: string;
  points: number;
  rank: number;
}

const SHAPES = ['▲', '◆', '●', '■'];
const OPTION_COLORS = [
  'text-red-500 border-red-500/30',
  'text-blue-500 border-blue-500/30',
  'text-amber-500 border-amber-500/30',
  'text-emerald-500 border-emerald-500/30',
];
const MEDAL = [
  { ring: 'border-amber-400/50 bg-amber-400/10', badge: 'bg-amber-400 text-amber-950', icon: <Crown className="w-3.5 h-3.5" /> },
  { ring: 'border-slate-400/50 bg-slate-400/10', badge: 'bg-slate-300 text-slate-900', icon: <Medal className="w-3.5 h-3.5" /> },
  { ring: 'border-orange-400/50 bg-orange-400/10', badge: 'bg-orange-400 text-orange-950', icon: <Medal className="w-3.5 h-3.5" /> },
];

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

/** Read-only review of a quiz from a finished class: shows every question with
 *  the correct option highlighted. No timers, scoring or live interaction. */
export default function QuizReview({ sessionId, stageId }: QuizReviewProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    Promise.all([
      quizService.listQuestions(sessionId, stageId).catch((e) => {
        console.error('Failed to load quiz for review', e);
        return [] as Question[];
      }),
      quizService.getLeaderboard(sessionId).catch((e) => {
        console.error('Failed to load leaderboard for review', e);
        return [] as ScoreEntry[];
      }),
    ])
      .then(([qs, lb]) => {
        if (!alive) return;
        setQuestions(qs);
        setScores(lb);
      })
      .finally(() => alive && setIsLoading(false));
    return () => { alive = false; };
  }, [sessionId, stageId]);

  const maxPoints = Math.max(1, ...scores.map((s) => s.points));

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm animate-pulse">
        Cargando quiz...
      </div>
    );
  }

  if (questions.length === 0 && scores.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background text-center gap-3 p-8">
        <HelpCircle className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">Esta etapa de quiz no tiene preguntas ni resultados guardados.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-background scrollbar-thin">
      <div className="max-w-2xl mx-auto p-5 sm:p-8 space-y-6">
        {/* ── Scoreboard: points of every student ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h2 className="text-foreground font-bold text-base">Resultados de la clase</h2>
              <p className="text-muted-foreground text-xs">
                {scores.length > 0
                  ? `Puntuación de ${scores.length} estudiante${scores.length !== 1 ? 's' : ''}`
                  : 'Puntuaciones de los estudiantes'}
              </p>
            </div>
          </div>

          {scores.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm bg-card border border-border rounded-xl px-4 py-3">
              <Users className="w-4 h-4" />
              Ningún estudiante registró puntos en esta clase.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {scores.map((s, i) => {
                const medal = MEDAL[i];
                return (
                  <motion.div
                    key={`${s.display_name}-${s.rank}`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.04 }}
                    className={cn(
                      'relative flex items-center gap-3 rounded-xl border px-3 py-2 overflow-hidden',
                      medal ? medal.ring : 'bg-card border-border',
                    )}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/5"
                      style={{ width: `${(s.points / maxPoints) * 100}%` }}
                    />
                    <div className={cn(
                      'relative z-10 w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0',
                      medal ? medal.badge : 'bg-muted text-muted-foreground',
                    )}>
                      {medal ? medal.icon : s.rank}
                    </div>
                    <div className="relative z-10 w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold text-foreground shrink-0">
                      {initials(s.display_name)}
                    </div>
                    <span className="relative z-10 flex-1 min-w-0 truncate text-sm font-semibold text-foreground">
                      {s.display_name}
                    </span>
                    <span className="relative z-10 font-black text-sm tabular-nums text-foreground shrink-0">
                      {s.points.toLocaleString()} <span className="text-[10px] font-bold text-muted-foreground">pts</span>
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Questions with correct answers ── */}
        {questions.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-foreground font-bold text-base">Repaso del Quiz</h2>
              <p className="text-muted-foreground text-xs">{questions.length} pregunta{questions.length !== 1 ? 's' : ''} · respuestas correctas resaltadas</p>
            </div>
          </div>
        )}

        {questions.map((q, qi) => (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: qi * 0.05 }}
            className="bg-card border border-border rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-start gap-3 mb-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                {qi + 1}
              </span>
              <p className="text-foreground font-semibold text-sm leading-snug">{q.question_text}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-9">
              {q.options.map((opt, oi) => (
                <div
                  key={opt.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                    opt.is_correct
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600 font-semibold ring-1 ring-emerald-500/30'
                      : cn('bg-card', OPTION_COLORS[oi] ?? OPTION_COLORS[0]),
                  )}
                >
                  <span className="shrink-0">{SHAPES[oi] ?? '•'}</span>
                  <span className="flex-1 truncate text-foreground">{opt.text || '—'}</span>
                  {opt.is_correct && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
