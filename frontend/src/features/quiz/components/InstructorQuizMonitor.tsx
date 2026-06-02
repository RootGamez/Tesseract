import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Clock, Trophy, Users } from 'lucide-react';

interface LiveQuestion {
  question_id: string;
  text: string;
  options: { id: number; text: string }[];
  duration_s: number;
}

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
}

interface InstructorQuizMonitorProps {
  participants: Participant[];
  quizLaunched: boolean;
  activeQuestion?: LiveQuestion | null;
}

const SHAPES = ['▲', '◆', '●', '■'];
const OPTION_COLORS = [
  { bar: 'bg-red-500',     badge: 'bg-red-500/10 border-red-500/30 text-red-500',     avatar: 'bg-red-500' },
  { bar: 'bg-blue-500',    badge: 'bg-blue-500/10 border-blue-500/30 text-blue-500',    avatar: 'bg-blue-500' },
  { bar: 'bg-amber-500',   badge: 'bg-amber-500/10 border-amber-500/30 text-amber-500',   avatar: 'bg-amber-500' },
  { bar: 'bg-emerald-500', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500', avatar: 'bg-emerald-500' },
];

export default function InstructorQuizMonitor({ participants, quizLaunched, activeQuestion }: InstructorQuizMonitorProps) {
  // Initialize from prop so it's available immediately on mount
  const [currentQuestion, setCurrentQuestion] = useState<LiveQuestion | null>(activeQuestion ?? null);
  const [results, setResults] = useState<QuizResults | null>(null);

  // Sync when prop changes (next question launched)
  useEffect(() => {
    if (activeQuestion) {
      setCurrentQuestion(activeQuestion);
      setResults(null);
    }
  }, [activeQuestion]);

  // Also listen for WebSocket echo (students share same event)
  useEffect(() => {
    const onLaunched = (e: Event) => {
      setCurrentQuestion((e as CustomEvent<LiveQuestion>).detail);
      setResults(null);
    };
    window.addEventListener('quiz-launched', onLaunched);
    return () => window.removeEventListener('quiz-launched', onLaunched);
  }, []);

  useEffect(() => {
    const onResults = (e: Event) => {
      setResults((e as CustomEvent<QuizResults>).detail);
    };
    window.addEventListener('quiz-results', onResults);
    return () => window.removeEventListener('quiz-results', onResults);
  }, []);

  const onlinePlayers = participants.filter(p => p.online);
  const respondedIds = new Set((results?.responses ?? []).filter(Boolean).map(r => r.participant_id));
  const totalOnline = onlinePlayers.length;
  const totalAnswered = results?.total_responses ?? 0;
  const progress = totalOnline > 0 ? (totalAnswered / totalOnline) * 100 : 0;

  if (!quizLaunched || !currentQuestion) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background text-center gap-4 p-8">
        <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
          <Trophy className="w-8 h-8 text-accent animate-pulse" />
        </div>
        <div>
          <h3 className="text-foreground font-semibold text-base">Quiz preparado</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            La pregunta aparecerá aquí en cuanto sea lanzada.
          </p>
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

      {/* ── Pregunta activa ─────────────────────────────────────── */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border">

        {/* Progreso */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-muted-foreground">
            {totalAnswered} / {totalOnline} respondieron
          </span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground">{Math.round(progress)}%</span>
        </div>

        {/* Texto de la pregunta */}
        <div className="bg-card border border-border rounded-xl px-4 py-3 mb-3 shadow-sm">
          <p className="text-foreground font-semibold text-sm leading-snug">
            {currentQuestion.text}
          </p>
        </div>

        {/* Opciones con contadores */}
        <div className="grid grid-cols-2 gap-2">
          {currentQuestion.options.map((opt, idx) => {
            const s = OPTION_COLORS[idx] ?? OPTION_COLORS[0];
            const count = results?.counts?.[String(idx)] ?? 0;
            const pct = totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
            return (
              <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${s.badge}`}>
                <span>{SHAPES[idx]}</span>
                <span className="truncate flex-1">{opt.text}</span>
                {results && (
                  <span className="shrink-0 font-bold">{count} · {pct}%</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Cards de estudiantes ─────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-5 py-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Estudiantes ({totalOnline})
        </p>

        {onlinePlayers.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            No hay estudiantes conectados
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            <AnimatePresence>
              {onlinePlayers.map(p => {
                const responded = respondedIds.has(p.id);
                const response = results?.responses?.find(r => r.participant_id === p.id);
                const answerIdx = response ? Number(response.answer_index) : -1;
                const shape = answerIdx >= 0 ? OPTION_COLORS[answerIdx] : null;

                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 transition-colors ${
                      responded
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-card border-border'
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 transition-colors ${
                      responded
                        ? 'bg-primary border-primary/50'
                        : 'bg-muted border-border text-muted-foreground'
                    }`}>
                      {p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>

                    {/* Nombre */}
                    <p className="text-xs font-medium text-foreground text-center truncate w-full leading-tight">
                      {p.name.split(' ')[0]}
                    </p>

                    {/* Estado */}
                    {responded && shape ? (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${shape.badge}`}>
                        {SHAPES[answerIdx]}
                      </span>
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
