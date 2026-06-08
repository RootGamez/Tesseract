import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Clock, Trophy, Users, Crown, Medal } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { LiveQuestion, QuizRevealPayload } from '../types';

interface ParticipantResponse {
  participant_id: string;
  display_name: string;
  answer_index: number | string;
}

interface QuizResults {
  question_id: string;
  counts: Record<string, number>;
  total_responses: number;
  responses: ParticipantResponse[];
}

interface Participant {
  id: string;
  name: string;
  online: boolean;
  points: number;
  isInstructor?: boolean;
}

interface InstructorQuizMonitorProps {
  participants: Participant[];
  quizLaunched: boolean;
  activeQuestion?: LiveQuestion | null;
  revealed: boolean;
  onTimeUp?: () => void;
}

const SHAPES = ['▲', '◆', '●', '■'];
const OPTION_COLORS = [
  { bar: 'bg-red-500', badge: 'bg-red-500/10 border-red-500/30 text-red-500' },
  { bar: 'bg-blue-500', badge: 'bg-blue-500/10 border-blue-500/30 text-blue-500' },
  { bar: 'bg-amber-500', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-500' },
  { bar: 'bg-emerald-500', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' },
];
const MEDAL = [
  { ring: 'border-amber-400/50 bg-amber-400/10', icon: <Crown className="w-3.5 h-3.5 text-amber-500" /> },
  { ring: 'border-slate-400/50 bg-slate-400/10', icon: <Medal className="w-3.5 h-3.5 text-slate-400" /> },
  { ring: 'border-orange-400/50 bg-orange-400/10', icon: <Medal className="w-3.5 h-3.5 text-orange-500" /> },
];

export default function InstructorQuizMonitor({ participants, quizLaunched, activeQuestion, revealed, onTimeUp }: InstructorQuizMonitorProps) {
  const [currentQuestion, setCurrentQuestion] = useState<LiveQuestion | null>(activeQuestion ?? null);
  const [results, setResults] = useState<QuizResults | null>(null);
  const [reveal, setReveal] = useState<QuizRevealPayload | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedTimeUp = useRef(false);
  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => { onTimeUpRef.current = onTimeUp; }, [onTimeUp]);

  // New question launched → reset everything and start the countdown.
  useEffect(() => {
    if (!activeQuestion) return;
    setCurrentQuestion(activeQuestion);
    setResults(null);
    setReveal(null);
    firedTimeUp.current = false;
    setTimeLeft(activeQuestion.duration_s ?? 20);
  }, [activeQuestion]);

  useEffect(() => {
    const onLaunched = (e: Event) => {
      setCurrentQuestion((e as CustomEvent<LiveQuestion>).detail);
      setResults(null);
      setReveal(null);
      firedTimeUp.current = false;
      setTimeLeft((e as CustomEvent<LiveQuestion>).detail.duration_s ?? 20);
    };
    const onResults = (e: Event) => setResults((e as CustomEvent<QuizResults>).detail);
    const onReveal = (e: Event) => setReveal((e as CustomEvent<QuizRevealPayload>).detail);
    window.addEventListener('quiz-launched', onLaunched);
    window.addEventListener('quiz-results', onResults);
    window.addEventListener('quiz-reveal', onReveal);
    return () => {
      window.removeEventListener('quiz-launched', onLaunched);
      window.removeEventListener('quiz-results', onResults);
      window.removeEventListener('quiz-reveal', onReveal);
    };
  }, []);

  // Countdown — restarts per question, stops as soon as the answer is revealed.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!currentQuestion || revealed || reveal) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (!firedTimeUp.current) {
            firedTimeUp.current = true;
            onTimeUpRef.current?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentQuestion?.question_id, revealed, reveal]);

  const onlinePlayers = participants.filter((p) => p.online && !p.isInstructor);
  const respondedIds = new Set((results?.responses ?? []).filter(Boolean).map((r) => r.participant_id));
  const totalOnline = onlinePlayers.length;
  const totalAnswered = reveal?.total_responses ?? results?.total_responses ?? 0;
  const progress = totalOnline > 0 ? (totalAnswered / totalOnline) * 100 : 0;
  const counts = reveal?.counts ?? results?.counts ?? {};
  const correctIdx = reveal?.correct_index ?? -1;
  const top3 = (reveal?.leaderboard ?? []).slice(0, 3);

  if (!quizLaunched || !currentQuestion) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background text-center gap-4 p-8">
        <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
          <Trophy className="w-8 h-8 text-accent animate-pulse" />
        </div>
        <div>
          <h3 className="text-foreground font-semibold text-base">Quiz preparado</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">La pregunta aparecerá aquí en cuanto sea lanzada.</p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Users className="w-3.5 h-3.5" />
          <span>{totalOnline} estudiante{totalOnline !== 1 ? 's' : ''} conectado{totalOnline !== 1 ? 's' : ''}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-background overflow-hidden">
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border">
        {/* progress + countdown */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-muted-foreground">{totalAnswered} / {totalOnline} respondieron</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div className="h-full bg-primary rounded-full" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
          </div>
          {!reveal && timeLeft != null && (
            <span className={cn('text-xs font-black tabular-nums px-2 py-0.5 rounded-md', timeLeft <= 5 ? 'bg-red-500/15 text-red-500' : 'bg-muted text-foreground')}>
              {timeLeft}s
            </span>
          )}
          {reveal && <span className="text-xs font-bold text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Revelado</span>}
        </div>

        <div className="bg-card border border-border rounded-xl px-4 py-3 mb-3 shadow-sm">
          <p className="text-foreground font-semibold text-sm leading-snug">{currentQuestion.text}</p>
        </div>

        {/* options + counts (correct highlighted after reveal) */}
        <div className="grid grid-cols-2 gap-2">
          {currentQuestion.options.map((opt, idx) => {
            const s = OPTION_COLORS[idx] ?? OPTION_COLORS[0];
            const count = counts[String(idx)] ?? 0;
            const pct = totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
            const isCorrect = reveal && idx === correctIdx;
            return (
              <div
                key={idx}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
                  isCorrect ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 ring-1 ring-emerald-500/40' : reveal ? 'opacity-50 ' + s.badge : s.badge,
                )}
              >
                <span>{SHAPES[idx]}</span>
                <span className="truncate flex-1">{opt.text}</span>
                {isCorrect && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                {(results || reveal) && <span className="shrink-0 font-bold">{count} · {pct}%</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 3 after reveal */}
      <AnimatePresence>
        {reveal && top3.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="shrink-0 px-5 py-3 border-b border-border bg-card/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-amber-500" /> Top 3</p>
            <div className="flex flex-col gap-1.5">
              {top3.map((e, i) => (
                <motion.div key={e.participant_id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1.5', MEDAL[i].ring)}>
                  <span className="w-5 flex items-center justify-center">{MEDAL[i].icon}</span>
                  <span className="flex-1 truncate text-sm font-semibold text-foreground">{e.display_name}</span>
                  <span className="font-black text-sm tabular-nums text-foreground">{e.points.toLocaleString()}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* student cards */}
      <div className="flex-1 overflow-auto px-5 py-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Estudiantes ({totalOnline})</p>
        {onlinePlayers.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No hay estudiantes conectados</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            <AnimatePresence>
              {onlinePlayers.map((p) => {
                const responded = respondedIds.has(p.id);
                const response = results?.responses?.find((r) => r.participant_id === p.id);
                const answerIdx = response ? Number(response.answer_index) : -1;
                const shape = answerIdx >= 0 ? OPTION_COLORS[answerIdx] : null;
                return (
                  <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}
                    className={cn('flex flex-col items-center gap-2 rounded-xl border px-3 py-3 transition-colors', responded ? 'bg-primary/5 border-primary/20' : 'bg-card border-border')}>
                    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 transition-colors', responded ? 'bg-primary border-primary/50' : 'bg-muted border-border text-muted-foreground')}>
                      {p.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-xs font-medium text-foreground text-center truncate w-full leading-tight">{p.name.split(' ')[0]}</p>
                    {responded && shape ? (
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', shape.badge)}>{SHAPES[answerIdx]}</span>
                    ) : responded ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-muted-foreground/50 animate-pulse" />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
