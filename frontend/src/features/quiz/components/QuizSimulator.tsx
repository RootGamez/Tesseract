import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Award, CheckCircle, XCircle, ArrowRight, RotateCw, Volume2, Timer as TimerIcon } from 'lucide-react';
import { Question } from '../store/useQuizStore';
import { Button } from '@/shared/components/ui/button';

interface QuizSimulatorProps {
  questions: Question[];
  onExit: () => void;
}

type GameState = 'get-ready' | 'question' | 'answered' | 'game-over';

const SHAPES = [
  { shape: '▲', color: 'bg-red-500 hover:bg-red-600', activeBg: 'bg-red-500', border: 'border-red-700', text: 'Rojo' },
  { shape: '◆', color: 'bg-blue-500 hover:bg-blue-600', activeBg: 'bg-blue-500', border: 'border-blue-700', text: 'Azul' },
  { shape: '●', color: 'bg-amber-500 hover:bg-amber-600', activeBg: 'bg-amber-500', border: 'border-amber-700', text: 'Amarillo' },
  { shape: '■', color: 'bg-emerald-500 hover:bg-emerald-600', activeBg: 'bg-emerald-500', border: 'border-emerald-700', text: 'Verde' },
];

export default function QuizSimulator({ questions, onExit }: QuizSimulatorProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [gameState, setGameState] = useState<GameState>('get-ready');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedOptIdx, setSelectedOptIdx] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  
  // Timer references to manage intervals safely
  const countdownIntervalRef = useRef<any>(null);
  const questionIntervalRef = useRef<any>(null);

  const currentQuestion = questions[currentIdx];
  const totalQuestions = questions.length;

  // Trigger 3s count down before showing the question
  useEffect(() => {
    if (gameState === 'get-ready') {
      setCountdown(3);
      setSelectedOptIdx(null);
      setTimeLeft(20);
      
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current!);
            setGameState('question');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [gameState, currentIdx]);

  // Main question timer
  useEffect(() => {
    if (gameState === 'question') {
      setTimeLeft(20);
      questionIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(questionIntervalRef.current!);
            // Time is up, auto submit empty answer
            handleAnswerSelect(-1);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (questionIntervalRef.current) clearInterval(questionIntervalRef.current);
    };
  }, [gameState]);

  // Trigger confetti for correct answer
  const triggerConfetti = (strength: 'single' | 'victory') => {
    if (strength === 'single') {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 }
      });
    } else {
      const duration = 3 * 1000;
      const end = Date.now() + duration;

      (function frame() {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.8 }
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.8 }
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      }());
    }
  };

  const handleAnswerSelect = (optIdx: number) => {
    if (gameState !== 'question') return;
    
    // Clear question timer
    if (questionIntervalRef.current) {
      clearInterval(questionIntervalRef.current);
    }

    setSelectedOptIdx(optIdx);
    setGameState('answered');

    const isCorrect = optIdx >= 0 && currentQuestion.options[optIdx]?.is_correct;

    if (isCorrect) {
      setCorrectAnswersCount((prev) => prev + 1);
      // Speed bonus formula: base 500pts + up to 500pts speed bonus
      const speedBonus = Math.round((timeLeft / 20) * 500);
      setScore((prev) => prev + 500 + speedBonus);
      triggerConfetti('single');
    }
  };

  const handleNext = () => {
    if (currentIdx + 1 < totalQuestions) {
      setCurrentIdx((prev) => prev + 1);
      setGameState('get-ready');
    } else {
      setGameState('game-over');
      triggerConfetti('victory');
    }
  };

  const restartQuiz = () => {
    setCurrentIdx(0);
    setScore(0);
    setCorrectAnswersCount(0);
    setGameState('get-ready');
  };

  // Helper values to show feedback
  const isSelectedCorrect = selectedOptIdx !== null && selectedOptIdx >= 0 && currentQuestion?.options[selectedOptIdx]?.is_correct;
  const correctOptIdx = currentQuestion?.options?.findIndex(o => o.is_correct);

  return (
    <div className="min-h-[80vh] flex flex-col justify-between bg-[#461A42] text-white rounded-3xl p-6 md:p-8 overflow-hidden shadow-2xl relative">
      
      {/* Background decoration elements */}
      <div className="absolute inset-0 bg-radial-gradient opacity-10 pointer-events-none" />

      {/* Game Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 z-10">
        <div className="flex items-center gap-3">
          <span className="bg-white/15 px-3.5 py-1.5 rounded-xl font-bold text-xs md:text-sm tracking-wider">
            PREGUNTA {currentIdx + 1} DE {totalQuestions}
          </span>
          <span className="hidden sm:inline text-white/50 text-sm">|</span>
          <span className="hidden sm:inline text-[#E8C5E5] text-sm font-semibold">
            Puntaje: {score}
          </span>
        </div>
        <Button 
          variant="ghost" 
          onClick={onExit} 
          className="text-white/60 hover:text-white hover:bg-white/10 text-xs md:text-sm"
        >
          Salir de Simulación
        </Button>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col justify-center py-6 md:py-10 z-10">
        <AnimatePresence mode="wait">
          
          {/* STATE 1: GET READY (COUNTDOWN) */}
          {gameState === 'get-ready' && (
            <motion.div
              key="get-ready"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.3 }}
              className="text-center space-y-6 flex flex-col items-center justify-center my-auto"
            >
              <h2 className="text-2xl md:text-4xl font-extrabold text-[#E8C5E5] tracking-wide animate-pulse">
                ¿Listo para la pregunta?
              </h2>
              
              <div className="relative w-32 h-32 flex items-center justify-center">
                {/* Spinning progress border */}
                <svg className="absolute w-full h-full -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    className="stroke-white/10 fill-none"
                    strokeWidth="8"
                  />
                  <motion.circle
                    cx="64"
                    cy="64"
                    r="56"
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

              <p className="text-white/70 max-w-md text-sm font-medium">
                La pregunta actual es: <br/>
                <span className="text-white font-semibold text-base italic">
                  "{currentQuestion?.question_text}"
                </span>
              </p>
            </motion.div>
          )}

          {/* STATE 2: QUESTION SCREEN */}
          {gameState === 'question' && (
            <motion.div
              key="question"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="flex-1 flex flex-col justify-between space-y-8"
            >
              {/* Question Text block */}
              <div className="text-center py-6 bg-white/5 rounded-2xl border border-white/10 px-4 shadow-inner">
                <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-snug px-2 max-w-4xl mx-auto">
                  {currentQuestion?.question_text}
                </h1>
              </div>

              {/* Middle Section: Timer or visuals */}
              <div className="flex justify-center items-center gap-8 py-2">
                {/* Timer Circle */}
                <div className="relative w-20 h-20 bg-black/20 rounded-full flex items-center justify-center shadow-lg border border-white/10">
                  <svg className="absolute w-full h-full -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      className="stroke-white/10 fill-none"
                      strokeWidth="4"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      className={`${timeLeft <= 5 ? 'stroke-red-500 animate-pulse' : 'stroke-blue-400'} fill-none`}
                      strokeWidth="4"
                      strokeDasharray={213.6}
                      strokeDashoffset={213.6 - (213.6 * timeLeft) / 20}
                    />
                  </svg>
                  <div className="text-center">
                    <span className={`text-2xl font-black ${timeLeft <= 5 ? 'text-red-500 scale-110' : 'text-white'} transition-all`}>
                      {timeLeft}
                    </span>
                    <span className="block text-[8px] text-white/50 uppercase font-bold tracking-wider">Segs</span>
                  </div>
                </div>
              </div>

              {/* Answers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                {currentQuestion?.options?.map((opt, optIdx) => {
                  const shapeInfo = SHAPES[optIdx];
                  return (
                    <motion.button
                      key={opt.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: optIdx * 0.08 }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleAnswerSelect(optIdx)}
                      className={`${shapeInfo.color} ${shapeInfo.border} border-b-4 text-white text-left p-5 md:p-6 rounded-2xl cursor-pointer flex items-center gap-4 transition-all shadow-md group relative overflow-hidden`}
                    >
                      {/* Shape symbol wrapper */}
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl font-black shrink-0 group-hover:scale-110 transition-transform">
                        {shapeInfo.shape}
                      </div>
                      <span className="text-base md:text-lg font-bold truncate pr-2">
                        {opt.text}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* STATE 3: FEEDBACK SCREEN (ANSWERED) */}
          {gameState === 'answered' && (
            <motion.div
              key="answered"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="text-center py-8 max-w-2xl mx-auto space-y-8 flex flex-col items-center justify-center my-auto"
            >
              {selectedOptIdx === -1 ? (
                // Time up view
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    <XCircle className="w-14 h-14" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black text-red-500">
                    ¡TIEMPO AGOTADO!
                  </h2>
                  <p className="text-white/60 font-medium">No seleccionaste ninguna respuesta a tiempo.</p>
                </div>
              ) : isSelectedCorrect ? (
                // Correct answer view
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-bounce">
                    <CheckCircle className="w-14 h-14" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black text-emerald-400 tracking-wide">
                    ¡CORRECTO!
                  </h2>
                  <p className="text-emerald-300 font-bold bg-emerald-500/10 px-4 py-1.5 rounded-full inline-block text-sm border border-emerald-500/20 shadow-sm">
                    + {Math.round(500 + (timeLeft / 20) * 500)} puntos
                  </p>
                </div>
              ) : (
                // Incorrect answer view
                <div className="space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 animate-shake">
                    <XCircle className="w-14 h-14" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black text-red-400">
                    INCORRECTO
                  </h2>
                  <p className="text-white/60 font-medium">¡Sigue intentándolo!</p>
                </div>
              )}

              {/* Correct answer display banner */}
              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 space-y-2.5">
                <span className="text-xs font-semibold tracking-wider text-white/50 uppercase block">
                  La respuesta correcta era:
                </span>
                <div className="flex items-center justify-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${SHAPES[correctOptIdx]?.activeBg} flex items-center justify-center text-sm font-bold shadow-md`}>
                    {SHAPES[correctOptIdx]?.shape}
                  </div>
                  <span className="text-lg md:text-xl font-bold text-white">
                    {currentQuestion.options[correctOptIdx]?.text}
                  </span>
                </div>
              </div>

              {/* Next Question action */}
              <Button
                onClick={handleNext}
                className="sidebar-gradient border-0 text-white gap-2 px-8 py-4 text-base font-bold shadow-lg hover:shadow-xl hover:scale-102 transition-all rounded-2xl"
              >
                {currentIdx + 1 === totalQuestions ? 'Ver Resultados' : 'Siguiente Pregunta'}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </motion.div>
          )}

          {/* STATE 4: GAME OVER SCREEN */}
          {gameState === 'game-over' && (
            <motion.div
              key="game-over"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8 max-w-md mx-auto space-y-8 flex flex-col items-center justify-center my-auto"
            >
              <div className="relative">
                <div className="inline-flex p-5 rounded-full bg-[#FFA600]/20 text-[#FFA600] border border-[#FFA600]/30 animate-pulse">
                  <Award className="w-16 h-16" />
                </div>
                {/* Floating sparks */}
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full animate-ping opacity-60" />
              </div>

              <div className="space-y-2">
                <h2 className="text-3xl md:text-5xl font-black text-white">
                  ¡Quiz Terminado!
                </h2>
                <p className="text-white/60 font-medium">Has completado la simulación del quiz.</p>
              </div>

              {/* Performance Card */}
              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center text-sm font-semibold border-b border-white/10 pb-3">
                  <span className="text-white/60">Respuestas Correctas</span>
                  <span className="text-emerald-400 text-lg font-bold">
                    {correctAnswersCount} / {totalQuestions}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-semibold border-b border-white/10 pb-3">
                  <span className="text-white/60">Precisión</span>
                  <span className="text-blue-400 text-lg font-bold">
                    {Math.round((correctAnswersCount / totalQuestions) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-semibold pt-1">
                  <span className="text-white/60 text-base">Puntaje Final</span>
                  <span className="text-[#FFA600] text-2xl font-black">
                    {score}
                  </span>
                </div>
              </div>

              {/* Options */}
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <Button
                  variant="outline"
                  onClick={restartQuiz}
                  className="flex-1 border-white/20 text-white hover:bg-white/10 hover:text-white py-4 rounded-xl gap-2 font-bold"
                >
                  <RotateCw className="w-4 h-4" />
                  Volver a Jugar
                </Button>
                <Button
                  onClick={onExit}
                  className="flex-1 sidebar-gradient border-0 text-white py-4 rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
                >
                  Regresar al Editor
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Simulator Footer */}
      <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs font-semibold text-white/40 z-10">
        <span className="flex items-center gap-1">
          <TimerIcon className="w-3.5 h-3.5" />
          Temporizador Activo
        </span>
        <span className="flex items-center gap-1">
          <Volume2 className="w-3.5 h-3.5 animate-pulse" />
          Efecto Confeti
        </span>
      </div>

    </div>
  );
}
