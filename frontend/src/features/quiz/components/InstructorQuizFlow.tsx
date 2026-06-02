import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, Trophy, ChevronRight, CheckCircle2,
  RotateCcw, Users, Clock, Zap, Play, Edit2,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { quizService } from '@/shared/services/quizService';
import { useQuizStore, type Question } from '../store/useQuizStore';
import QuizEditor from './QuizEditor';
import InstructorQuizMonitor from './InstructorQuizMonitor';

interface Participant {
  id: string;
  name: string;
  online: boolean;
  points: number;
  isInstructor?: boolean;
}

interface InstructorQuizFlowProps {
  sessionId: string;
  stageId: string;
  participants: Participant[];
  onLaunchQuestion: (index: number) => void;
  quizLaunched: boolean;
  quizQuestionIndex: number;
}

type FlowStep = 'select' | 'preview' | 'editing' | 'live';

const OPTION_SHAPES = ['▲', '◆', '●', '■'];
const OPTION_COLORS = [
  'text-red-500 border-red-500/30 bg-red-500/5',
  'text-blue-500 border-blue-500/30 bg-blue-500/5',
  'text-amber-500 border-amber-500/30 bg-amber-500/5',
  'text-emerald-500 border-emerald-500/30 bg-emerald-500/5',
];
const OPTION_CORRECT = 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10';

export default function InstructorQuizFlow({
  sessionId,
  stageId,
  participants,
  onLaunchQuestion,
  quizLaunched,
  quizQuestionIndex,
}: InstructorQuizFlowProps) {
  const [step, setStep] = useState<FlowStep>('select');
  const [savedQuizzes, setSavedQuizzes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<any | null>(null);
  const [loadedQuestions, setLoadedQuestions] = useState<Question[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<any | null>(null);

  const { questions: storeQuestions } = useQuizStore();

  useEffect(() => {
    setIsLoading(true);
    quizService.listSavedQuizzes()
      .then(setSavedQuizzes)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (quizLaunched) setStep('live');
  }, [quizLaunched]);

  const handleSelectSaved = async (quiz: any) => {
    setIsLoading(true);
    try {
      const full = await quizService.getSavedQuiz(quiz.id);
      const mapped: Question[] = (full.questions || []).map((q: any) => ({
        id: q.id,
        question_text: q.text ?? q.question_text,
        options: (q.options || []).map((o: any, i: number) => ({
          id: o.id || `o_${q.id}_${i}`,
          text: o.text,
          is_correct: o.is_correct === true,
        })),
      }));
      setSelectedQuiz(full);
      setLoadedQuestions(mapped);
      useQuizStore.setState({ questions: mapped });
      setStep('preview');
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    useQuizStore.getState().createBlankQuiz();
    setSelectedQuiz(null);
    setLoadedQuestions([]);
    setStep('editing');
  };

  const handleFinishEditing = () => {
    setLoadedQuestions(useQuizStore.getState().questions);
    setStep('preview');
  };

  const buildLiveQuestion = (index: number) => {
    const q = questions[index];
    if (!q) return null;
    return {
      question_id: q.id,
      text: q.question_text,
      options: q.options.map((o, i) => ({ id: i, text: o.text })),
      duration_s: 20,
    };
  };

  const launchQuestion = (index: number) => {
    const liveQ = buildLiveQuestion(index);
    if (!liveQ) return;
    setActiveQuestion(liveQ);
    // Also dispatch for students via WebSocket echo
    window.dispatchEvent(new CustomEvent('quiz-launched', { detail: liveQ }));
    onLaunchQuestion(index);
  };

  const handleStartQuiz = () => {
    const liveQ = buildLiveQuestion(0);
    if (!liveQ) return;
    setActiveQuestion(liveQ);
    window.dispatchEvent(new CustomEvent('quiz-launched', { detail: liveQ }));
    onLaunchQuestion(0);
    setStep('live');
  };

  const handleReset = () => {
    setStep('select');
    setSelectedQuiz(null);
    setLoadedQuestions([]);
  };

  const questions = loadedQuestions.length > 0 ? loadedQuestions : storeQuestions;
  const onlinePlayers = participants.filter(p => p.online && !p.isInstructor);

  return (
    <div className="w-full h-full flex flex-col bg-background overflow-hidden">
      <AnimatePresence mode="wait">

        {/* ── PASO 1: SELECCIONAR QUIZ ─────────────────────────────── */}
        {step === 'select' && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col overflow-hidden p-5 gap-5"
          >
            {/* Header */}
            <div className="shrink-0">
              <h2 className="text-foreground text-base font-bold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-accent" />
                Seleccionar Quiz
              </h2>
              <p className="text-muted-foreground text-xs mt-0.5">
                {onlinePlayers.length} estudiante{onlinePlayers.length !== 1 ? 's' : ''} conectado{onlinePlayers.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Quizzes guardados */}
            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                Quizzes guardados
              </p>

              {isLoading ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
                  Cargando...
                </div>
              ) : savedQuizzes.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center flex-1 flex flex-col items-center justify-center">
                  <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No tienes quizzes guardados aún.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-2 pr-1">
                  {savedQuizzes.map(quiz => (
                    <motion.button
                      key={quiz.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleSelectSaved(quiz)}
                      className="flex items-center gap-3 w-full text-left bg-card hover:bg-secondary border border-border hover:border-primary/40 rounded-xl px-4 py-3 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-foreground font-semibold text-sm truncate group-hover:text-primary transition-colors">
                          {quiz.title}
                        </p>
                        <p className="text-muted-foreground text-xs mt-0.5">
                          {quiz.question_count ?? '?'} pregunta{(quiz.question_count ?? 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Crear nuevo */}
            <div className="shrink-0 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                O crea uno nuevo
              </p>
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-3 w-full text-left bg-card hover:bg-secondary border border-dashed border-border hover:border-border rounded-xl px-4 py-3 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <div>
                  <p className="text-foreground font-medium text-sm">Crear quiz en blanco</p>
                  <p className="text-muted-foreground text-xs">Agrega preguntas manualmente</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}

        {/* ── PASO 2: VISTA PREVIA ─────────────────────────────────── */}
        {step === 'preview' && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
                    Quiz seleccionado
                  </p>
                  <h3 className="text-foreground font-bold text-sm truncate">
                    {selectedQuiz?.title ?? 'Nuevo Quiz'}
                  </h3>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {questions.length} pregunta{questions.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 px-2.5"
                    onClick={() => setStep('editing')}
                  >
                    <Edit2 className="w-3 h-3" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={handleReset}
                    title="Cambiar quiz"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Lista de preguntas */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 scrollbar-thin">
              {questions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay preguntas. Usa "Editar" para agregar.</p>
                </div>
              ) : (
                questions.map((q, i) => (
                  <div key={q.id} className="bg-card border border-border rounded-xl p-3.5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-sm font-medium leading-snug line-clamp-2">
                          {q.question_text || <span className="text-muted-foreground italic">Sin texto</span>}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                          {q.options.map((opt, oi) => (
                            <div
                              key={oi}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium ${
                                opt.is_correct ? OPTION_CORRECT : OPTION_COLORS[oi] ?? OPTION_COLORS[0]
                              }`}
                            >
                              <span className="shrink-0">{OPTION_SHAPES[oi]}</span>
                              <span className="truncate">{opt.text || '—'}</span>
                              {opt.is_correct && <CheckCircle2 className="w-3 h-3 shrink-0 ml-auto" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* CTA Iniciar */}
            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border space-y-3">
              <div className="flex items-center gap-3 text-muted-foreground text-xs">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {onlinePlayers.length} conectado{onlinePlayers.length !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1 ml-auto">
                  <Clock className="w-3.5 h-3.5" />
                  {questions.length} preguntas
                </span>
              </div>
              <Button
                className="w-full h-11 sidebar-gradient border-0 text-white font-bold text-sm gap-2 rounded-xl shadow-sm hover:opacity-95 disabled:opacity-40 transition-opacity"
                disabled={questions.length === 0}
                onClick={handleStartQuiz}
              >
                <Play className="w-4 h-4 fill-white" />
                Iniciar Quiz
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── PASO 3: EDITOR ───────────────────────────────────────── */}
        {step === 'editing' && (
          <motion.div
            key="editing"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="shrink-0 px-4 py-2.5 border-b border-border flex items-center justify-between bg-card">
              <button
                onClick={handleFinishEditing}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              >
                ← Vista previa
              </button>
              <Button
                size="sm"
                className="h-7 text-xs sidebar-gradient border-0 text-white gap-1.5 px-3"
                onClick={handleFinishEditing}
              >
                <CheckCircle2 className="w-3 h-3" /> Listo
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin bg-background">
              <QuizEditor sessionId={sessionId} stageId={stageId} />
            </div>
          </motion.div>
        )}

        {/* ── PASO 4: MONITOR EN VIVO ──────────────────────────────── */}
        {step === 'live' && (
          <motion.div
            key="live"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Barra de controles */}
            <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-card min-h-[44px]">
              {/* Indicador */}
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                Preg. {quizQuestionIndex + 1} / {questions.length}
              </span>

              <div className="flex-1" />

              {/* Nuevo quiz */}
              <button
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-muted shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Nuevo</span>
              </button>

              {/* Relanzar la pregunta actual */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 shrink-0"
                onClick={() => launchQuestion(quizQuestionIndex)}
              >
                Relanzar
              </Button>

              {/* Siguiente pregunta — solo si no es la última */}
              {quizQuestionIndex + 1 < questions.length ? (
                <Button
                  size="sm"
                  className="h-7 text-xs sidebar-gradient border-0 text-white px-3 shrink-0"
                  onClick={() => launchQuestion(quizQuestionIndex + 1)}
                >
                  Preg. {quizQuestionIndex + 2} →
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground px-2 shrink-0">✓ Último</span>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              <InstructorQuizMonitor
                participants={participants}
                quizLaunched={quizLaunched}
                activeQuestion={activeQuestion}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
