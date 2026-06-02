import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Award, CheckCircle, XCircle, Clock } from 'lucide-react';

interface QuizOption {
  id: number;
  text: string;
}

interface LiveQuestion {
  question_id: string;
  text: string;
  options: QuizOption[];
  duration_s: number;
}

interface StudentQuizViewProps {
  sessionId: string;
  stageId?: string;
  sendMessage: (channel: string, event: string, payload: any) => void;
}

type QuestionState = 'get-ready' | 'question' | 'answered';

const SHAPES = [
  { shape: '▲', color: 'bg-red-500 hover:bg-red-600', activeBg: 'bg-red-500', border: 'border-red-700' },
  { shape: '◆', color: 'bg-blue-500 hover:bg-blue-600', activeBg: 'bg-blue-500', border: 'border-blue-700' },
  { shape: '●', color: 'bg-amber-500 hover:bg-amber-600', activeBg: 'bg-amber-500', border: 'border-amber-700' },
  { shape: '■', color: 'bg-emerald-500 hover:bg-emerald-600', activeBg: 'bg-emerald-500', border: 'border-emerald-700' },
];

function triggerConfetti(type: 'correct' | 'victory') {
  if (type === 'correct') {
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
  } else {
    const end = Date.now() + 3000;
    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 } });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }
}

export default function StudentQuizView({ sendMessage }: StudentQuizViewProps) {
  const [currentQuestion, setCurrentQuestion] = useState<LiveQuestion | null>(null);
  const [questionState, setQuestionState] = useState<QuestionState>('get-ready');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Listen for new question from instructor via WebSocket
  useEffect(() => {
    const onLaunched = (e: Event) => {
      const payload = (e as CustomEvent<LiveQuestion>).detail;
      clearTimers();
      setCurrentQuestion(payload);
      setSelectedAnswer(null);
      setCountdown(3);
      setTimeLeft(payload.duration_s ?? 20);
      setQuestionState('get-ready');
    };
    window.addEventListener('quiz-launched', onLaunched);
    return () => {
      window.removeEventListener('quiz-launched', onLaunched);
      clearTimers();
    };
  }, []);

  // Countdown before showing question
  useEffect(() => {
    if (questionState !== 'get-ready' || !currentQuestion) return;
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          setQuestionState('question');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [questionState, currentQuestion]);

  // Question timer
  useEffect(() => {
    if (questionState !== 'question' || !currentQuestion) return;
    const duration = currentQuestion.duration_s ?? 20;
    setTimeLeft(duration);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer(-1); // time's up
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [questionState]);

  const handleAnswer = (optionIndex: number) => {
    if (questionState !== 'question' || !currentQuestion) return;
    clearTimers();
    setSelectedAnswer(optionIndex);
    setQuestionState('answered');
    setTotalAnswered(t => t + 1);

    const isCorrect = optionIndex >= 0 && currentQuestion.options[optionIndex] !== undefined;
    // We don't know which is correct on client until server reveals — but we track sent answer
    if (optionIndex >= 0) {
      sendMessage('gamification', 'QUIZ_RESPONSE', {
        question_id: currentQuestion.question_id,
        answer_index: optionIndex,
      });
    }
    // Show confetti if correct (server will confirm, but for UX we optimistically show it)
    // Real correctness shown from the options that have is_correct=true (if server sends it)
    if (isCorrect) triggerConfetti('correct');
  };

  // Derive correctness: the server sends options without is_correct during live quiz.
  // We check if any option in the question has is_correct field (revealed after answer).
  const correctOptIdx = currentQuestion?.options?.findIndex((o: any) => o.is_correct === true) ?? -1;
  const isSelectedCorrect = selectedAnswer !== null && selectedAnswer >= 0 && selectedAnswer === correctOptIdx;
  const duration = currentQuestion?.duration_s ?? 20;

  // ── WAITING SCREEN ──────────────────────────────────────────────────────────
  if (!currentQuestion) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#461A42]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <Clock className="w-10 h-10 text-[#E8C5E5] animate-pulse" />
          </div>
          <h2 className="text-white text-2xl font-bold">Quiz en curso</h2>
          <p className="text-white/50 text-sm mt-2 max-w-xs mx-auto">
            Espera a que el instructor lance la siguiente pregunta...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#461A42] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-3 shrink-0">
        <span className="bg-white/15 px-3.5 py-1.5 rounded-xl font-bold text-xs tracking-wider">
          {correctAnswers} correctas · {totalAnswered} respondidas
        </span>
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-[#FFA600]" />
          <span className="text-[#E8C5E5] text-sm font-semibold">Quiz en vivo</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col justify-center px-4 py-6 overflow-auto">
        <AnimatePresence mode="wait">

          {/* ── GET READY (COUNTDOWN) ── */}
          {questionState === 'get-ready' && (
            <motion.div
              key="get-ready"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.3 }}
              className="text-center space-y-6 flex flex-col items-center justify-center"
            >
              <h2 className="text-2xl md:text-4xl font-extrabold text-[#E8C5E5] tracking-wide animate-pulse">
                ¿Listo para la pregunta?
              </h2>

              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="absolute w-full h-full -rotate-90">
                  <circle cx="64" cy="64" r="56" className="stroke-white/10 fill-none" strokeWidth="8" />
                  <motion.circle
                    cx="64" cy="64" r="56"
                    className="stroke-[#FFA600] fill-none"
                    strokeWidth="8"
                    strokeDasharray={351.8}
                    initial={{ strokeDashoffset: 351.8 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 3, ease: 'linear' }}
                  />
                </svg>
                <motion.span
                  key={countdown}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-5xl font-black text-white"
                >
                  {countdown}
                </motion.span>
              </div>

              <p className="text-white/70 max-w-md text-sm font-medium px-4">
                La pregunta es: <br />
                <span className="text-white font-semibold text-base italic">
                  "{currentQuestion.text}"
                </span>
              </p>
            </motion.div>
          )}

          {/* ── QUESTION SCREEN ── */}
          {questionState === 'question' && (
            <motion.div
              key="question"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="flex flex-col gap-6 max-w-2xl mx-auto w-full"
            >
              {/* Question text */}
              <div className="text-center py-6 bg-white/5 rounded-2xl border border-white/10 px-4 shadow-inner">
                <h1 className="text-xl md:text-3xl font-extrabold tracking-tight leading-snug">
                  {currentQuestion.text}
                </h1>
              </div>

              {/* Timer */}
              <div className="flex justify-center">
                <div className="relative w-20 h-20 bg-black/20 rounded-full flex items-center justify-center shadow-lg border border-white/10">
                  <svg className="absolute w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="34" className="stroke-white/10 fill-none" strokeWidth="4" />
                    <circle
                      cx="40" cy="40" r="34"
                      className={`${timeLeft <= 5 ? 'stroke-red-500 animate-pulse' : 'stroke-blue-400'} fill-none`}
                      strokeWidth="4"
                      strokeDasharray={213.6}
                      strokeDashoffset={213.6 - (213.6 * timeLeft) / duration}
                    />
                  </svg>
                  <div className="text-center">
                    <span className={`text-2xl font-black ${timeLeft <= 5 ? 'text-red-500' : 'text-white'} transition-all`}>
                      {timeLeft}
                    </span>
                    <span className="block text-[8px] text-white/50 uppercase font-bold tracking-wider">Segs</span>
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((opt, idx) => {
                  const s = SHAPES[idx] ?? SHAPES[0];
                  return (
                    <motion.button
                      key={idx}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleAnswer(idx)}
                      className={`${s.color} ${s.border} border-b-4 text-white text-left p-5 rounded-2xl cursor-pointer flex items-center gap-4 transition-all shadow-md group`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl font-black shrink-0 group-hover:scale-110 transition-transform">
                        {s.shape}
                      </div>
                      <span className="text-base font-bold">{opt.text}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── ANSWERED SCREEN ── */}
          {questionState === 'answered' && (
            <motion.div
              key="answered"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="text-center max-w-2xl mx-auto w-full space-y-8 flex flex-col items-center justify-center py-6"
            >
              {selectedAnswer === -1 ? (
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    <XCircle className="w-14 h-14" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black text-red-500">¡TIEMPO AGOTADO!</h2>
                  <p className="text-white/60 font-medium">No seleccionaste ninguna respuesta a tiempo.</p>
                </div>
              ) : isSelectedCorrect || correctOptIdx === -1 ? (
                // Correct (or server hasn't revealed correct yet)
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-bounce">
                    <CheckCircle className="w-14 h-14" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black text-emerald-400 tracking-wide">
                    {correctOptIdx === -1 ? '¡RESPUESTA ENVIADA!' : '¡CORRECTO!'}
                  </h2>
                  <p className="text-white/60 font-medium">Espera la siguiente pregunta del instructor...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    <XCircle className="w-14 h-14" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black text-red-400">INCORRECTO</h2>
                  <p className="text-white/60 font-medium">¡Sigue intentándolo en la próxima!</p>
                </div>
              )}

              {/* Show correct answer if revealed by server */}
              {correctOptIdx >= 0 && (
                <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 space-y-2.5">
                  <span className="text-xs font-semibold tracking-wider text-white/50 uppercase block">
                    La respuesta correcta era:
                  </span>
                  <div className="flex items-center justify-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${SHAPES[correctOptIdx]?.activeBg} flex items-center justify-center text-sm font-bold shadow-md`}>
                      {SHAPES[correctOptIdx]?.shape}
                    </div>
                    <span className="text-lg font-bold text-white">
                      {currentQuestion.options[correctOptIdx]?.text}
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4">
                <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Tu respuesta</p>
                {selectedAnswer === -1 ? (
                  <p className="text-red-400 font-bold">Sin respuesta (tiempo agotado)</p>
                ) : (
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <div className={`w-7 h-7 rounded-lg ${SHAPES[selectedAnswer]?.activeBg} flex items-center justify-center text-xs font-bold`}>
                      {SHAPES[selectedAnswer]?.shape}
                    </div>
                    <span className="text-white font-semibold">
                      {currentQuestion.options[selectedAnswer]?.text}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-white/40 text-sm animate-pulse">
                Esperando que el instructor lance la siguiente pregunta...
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
