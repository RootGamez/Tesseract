import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Award, CheckCircle, XCircle, Clock, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { quizSound } from '@/shared/lib/quizSounds';
import { useQuizSound } from '@/shared/hooks/useQuizSound';
import AnimatedNumber from '@/shared/components/AnimatedNumber';
import QuizLeaderboard from './QuizLeaderboard';
import QuizPodium from './QuizPodium';
import type { LiveQuestion, QuizRevealPayload, QuizFinishedPayload } from '../types';

type ChannelType = 'sessions' | 'chat' | 'board' | 'presentations' | 'gamification';

interface StudentQuizViewProps {
  sessionId: string;
  stageId?: string;
  sendMessage: (channel: ChannelType, event: string, payload: any) => void;
}

type Phase = 'waiting' | 'get-ready' | 'question' | 'answered' | 'reveal' | 'leaderboard' | 'finished';

const SHAPES = [
  { shape: '▲', color: 'bg-red-500 hover:bg-red-600', activeBg: 'bg-red-500', border: 'border-red-700' },
  { shape: '◆', color: 'bg-blue-500 hover:bg-blue-600', activeBg: 'bg-blue-500', border: 'border-blue-700' },
  { shape: '●', color: 'bg-amber-500 hover:bg-amber-600', activeBg: 'bg-amber-500', border: 'border-amber-700' },
  { shape: '■', color: 'bg-emerald-500 hover:bg-emerald-600', activeBg: 'bg-emerald-500', border: 'border-emerald-700' },
];

function correctConfetti() {
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
}

export default function StudentQuizView({ sendMessage }: StudentQuizViewProps) {
  const [currentQuestion, setCurrentQuestion] = useState<LiveQuestion | null>(null);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [reveal, setReveal] = useState<QuizRevealPayload | null>(null);
  const [finished, setFinished] = useState<QuizFinishedPayload | null>(null);

  // Running personal score, kept up to date from reveal/finished payloads.
  const [myPoints, setMyPoints] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);

  const { muted, toggle: toggleMute } = useQuizSound();

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionStartedAt = useRef<number>(0);

  const clearTimers = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
  }, []);

  // ── Incoming events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onLaunched = (e: Event) => {
      const payload = (e as CustomEvent<LiveQuestion>).detail;
      clearTimers();
      quizSound.stopLobby();
      setReveal(null);
      setFinished(null);
      setCurrentQuestion(payload);
      setSelectedAnswer(null);
      setCountdown(3);
      setTimeLeft(payload.duration_s ?? 20);
      setPhase('get-ready');
    };

    const onReveal = (e: Event) => {
      const payload = (e as CustomEvent<QuizRevealPayload>).detail;
      clearTimers();
      setReveal(payload);
      if (payload.you_rank) {
        setMyPoints(payload.you_rank.points);
        setMyRank(payload.you_rank.rank);
        setMyParticipantId(payload.you_rank.participant_id);
      }
      setPhase('reveal');
      // Feedback sounds for this player.
      const gotIt = payload.you?.is_correct;
      if (gotIt) {
        quizSound.correct();
        correctConfetti();
      } else if (payload.you) {
        quizSound.wrong();
      } else {
        quizSound.reveal();
      }
      // After a beat, slide to the leaderboard.
      revealTimerRef.current = setTimeout(() => {
        setPhase('leaderboard');
        quizSound.leaderboard();
      }, 4000);
    };

    const onFinished = (e: Event) => {
      const payload = (e as CustomEvent<QuizFinishedPayload>).detail;
      clearTimers();
      quizSound.stopLobby();
      setFinished(payload);
      if (payload.you_rank) {
        setMyPoints(payload.you_rank.points);
        setMyRank(payload.you_rank.rank);
        setMyParticipantId(payload.you_rank.participant_id);
      }
      setPhase('finished');
    };

    window.addEventListener('quiz-launched', onLaunched);
    window.addEventListener('quiz-reveal', onReveal);
    window.addEventListener('quiz-finished', onFinished);
    return () => {
      window.removeEventListener('quiz-launched', onLaunched);
      window.removeEventListener('quiz-reveal', onReveal);
      window.removeEventListener('quiz-finished', onFinished);
      clearTimers();
    };
  }, [clearTimers]);

  // ── Lobby ambience while waiting ─────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'waiting') quizSound.lobby();
    else quizSound.stopLobby();
  }, [phase]);

  // ── Countdown before the question ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'get-ready' || !currentQuestion) return;
    setCountdown(3);
    quizSound.countdownTick(0);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          quizSound.go();
          setPhase('question');
          return 0;
        }
        quizSound.countdownTick(3 - prev + 1);
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [phase, currentQuestion]);

  // ── Question timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) return;
    const duration = currentQuestion.duration_s ?? 20;
    setTimeLeft(duration);
    questionStartedAt.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer(-1);
          return 0;
        }
        if (prev <= 6) quizSound.countdownTick(8 - prev);
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleAnswer = (optionIndex: number) => {
    if (phase !== 'question' || !currentQuestion) return;
    clearTimers();
    setSelectedAnswer(optionIndex);
    setPhase('answered');

    if (optionIndex >= 0) {
      quizSound.answerSubmit();
      sendMessage('gamification', 'QUIZ_RESPONSE', {
        question_id: currentQuestion.question_id,
        answer_index: optionIndex,
        response_time_ms: Date.now() - questionStartedAt.current,
      });
    } else {
      quizSound.timeUp();
    }
  };

  const duration = currentQuestion?.duration_s ?? 20;
  const correctIdx = reveal?.correct_index ?? -1;
  const youCorrect = reveal?.you?.is_correct ?? false;
  const gained = reveal?.you?.points_awarded ?? 0;

  // ── Header (persistent score + sound toggle) ─────────────────────────────────
  const Header = (
    <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 shrink-0">
      <div className="flex items-center gap-2">
        <Award className="w-4 h-4 text-[#FFA600]" />
        <span className="text-[#E8C5E5] text-sm font-semibold">Quiz en vivo</span>
      </div>
      <div className="flex items-center gap-2">
        {myRank != null && (
          <span className="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-lg text-xs font-bold text-white">
            <Trophy className="w-3.5 h-3.5 text-amber-300" /> #{myRank}
          </span>
        )}
        <span className="flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-lg text-xs font-black text-white tabular-nums">
          <Zap className="w-3.5 h-3.5 text-amber-300" />
          <AnimatedNumber value={myPoints} /> pts
        </span>
        <button
          onClick={toggleMute}
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors"
          title={muted ? 'Activar sonido' : 'Silenciar'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  // ── FINISHED (podium) ─────────────────────────────────────────────────────────
  if (phase === 'finished' && finished) {
    return (
      <div className="w-full h-full">
        <QuizPodium entries={finished.leaderboard ?? []} currentParticipantId={myParticipantId} />
      </div>
    );
  }

  // ── WAITING ─────────────────────────────────────────────────────────────────
  if (phase === 'waiting' || !currentQuestion) {
    return (
      <div className="w-full h-full flex flex-col bg-[#461A42]">
        {Header}
        <div className="flex-1 flex items-center justify-center">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-6 shadow-2xl">
              <Clock className="w-10 h-10 text-[#E8C5E5] animate-pulse" />
            </div>
            <h2 className="text-white text-2xl font-bold">Quiz en curso</h2>
            <p className="text-white/50 text-sm mt-2 max-w-xs mx-auto">
              Espera a que el instructor lance la siguiente pregunta...
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#461A42] text-white overflow-hidden">
      {Header}

      <div className="flex-1 flex flex-col justify-center px-4 py-6 overflow-auto">
        <AnimatePresence mode="wait">

          {/* ── GET READY ── */}
          {phase === 'get-ready' && (
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
                    cx="64" cy="64" r="56" className="stroke-[#FFA600] fill-none" strokeWidth="8"
                    strokeDasharray={351.8}
                    initial={{ strokeDashoffset: 351.8 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 3, ease: 'linear' }}
                  />
                </svg>
                <motion.span key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-5xl font-black text-white">
                  {countdown}
                </motion.span>
              </div>
              <p className="text-white/70 max-w-md text-sm font-medium px-4">
                La pregunta es: <br />
                <span className="text-white font-semibold text-base italic">"{currentQuestion.text}"</span>
              </p>
            </motion.div>
          )}

          {/* ── QUESTION ── */}
          {phase === 'question' && (
            <motion.div key="question" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
              <div className="text-center py-6 bg-white/5 rounded-2xl border border-white/10 px-4 shadow-inner">
                <h1 className="text-xl md:text-3xl font-extrabold tracking-tight leading-snug">{currentQuestion.text}</h1>
              </div>
              <div className="flex justify-center">
                <div className="relative w-20 h-20 bg-black/20 rounded-full flex items-center justify-center shadow-lg border border-white/10">
                  <svg className="absolute w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="34" className="stroke-white/10 fill-none" strokeWidth="4" />
                    <circle cx="40" cy="40" r="34" className={`${timeLeft <= 5 ? 'stroke-red-500 animate-pulse' : 'stroke-blue-400'} fill-none`} strokeWidth="4" strokeDasharray={213.6} strokeDashoffset={213.6 - (213.6 * timeLeft) / duration} />
                  </svg>
                  <div className="text-center">
                    <span className={`text-2xl font-black ${timeLeft <= 5 ? 'text-red-500' : 'text-white'} transition-all`}>{timeLeft}</span>
                    <span className="block text-[8px] text-white/50 uppercase font-bold tracking-wider">Segs</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((opt, idx) => {
                  const s = SHAPES[idx] ?? SHAPES[0];
                  return (
                    <motion.button
                      key={idx}
                      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }}
                      whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                      onClick={() => handleAnswer(idx)}
                      className={`${s.color} ${s.border} border-b-4 text-white text-left p-5 rounded-2xl cursor-pointer flex items-center gap-4 transition-all shadow-md group`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl font-black shrink-0 group-hover:scale-110 transition-transform">{s.shape}</div>
                      <span className="text-base font-bold">{opt.text}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── ANSWERED (waiting for reveal) ── */}
          {phase === 'answered' && (
            <motion.div key="answered" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center max-w-md mx-auto w-full space-y-6 flex flex-col items-center justify-center py-6">
              {selectedAnswer === -1 ? (
                <>
                  <div className="inline-flex p-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/30"><XCircle className="w-14 h-14" /></div>
                  <h2 className="text-3xl font-black text-red-400">¡TIEMPO AGOTADO!</h2>
                </>
              ) : (
                <>
                  <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="inline-flex p-4 rounded-full bg-white/10 text-white border border-white/20">
                    <CheckCircle className="w-14 h-14" />
                  </motion.div>
                  <h2 className="text-3xl font-black text-white">¡Respuesta enviada!</h2>
                  {selectedAnswer != null && selectedAnswer >= 0 && (
                    <div className="flex items-center justify-center gap-2">
                      <div className={`w-7 h-7 rounded-lg ${SHAPES[selectedAnswer]?.activeBg} flex items-center justify-center text-xs font-bold`}>{SHAPES[selectedAnswer]?.shape}</div>
                      <span className="text-white/80 font-semibold">{currentQuestion.options[selectedAnswer]?.text}</span>
                    </div>
                  )}
                </>
              )}
              <p className="text-white/50 text-sm animate-pulse">Esperando a que todos respondan...</p>
            </motion.div>
          )}

          {/* ── REVEAL ── */}
          {phase === 'reveal' && reveal && (
            <motion.div key="reveal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="text-center max-w-2xl mx-auto w-full space-y-6 flex flex-col items-center justify-center py-4">
              {reveal.you ? (
                youCorrect ? (
                  <>
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><CheckCircle className="w-14 h-14" /></motion.div>
                    <h2 className="text-3xl md:text-5xl font-black text-emerald-400 tracking-wide">¡CORRECTO!</h2>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-2xl font-black text-amber-300">
                      <Zap className="w-6 h-6" /> +<AnimatedNumber value={gained} duration={700} />
                    </motion.div>
                  </>
                ) : (
                  <>
                    <div className="inline-flex p-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/30"><XCircle className="w-14 h-14" /></div>
                    <h2 className="text-3xl md:text-5xl font-black text-red-400">INCORRECTO</h2>
                    <p className="text-white/60 font-medium">¡Sigue intentándolo en la próxima!</p>
                  </>
                )
              ) : (
                <>
                  <div className="inline-flex p-4 rounded-full bg-red-500/20 text-red-400 border border-red-500/30"><Clock className="w-14 h-14" /></div>
                  <h2 className="text-3xl md:text-5xl font-black text-red-400">SIN RESPUESTA</h2>
                </>
              )}

              {/* Correct answer */}
              {correctIdx >= 0 && (
                <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 space-y-2.5">
                  <span className="text-xs font-semibold tracking-wider text-white/50 uppercase block">La respuesta correcta era:</span>
                  <div className="flex items-center justify-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${SHAPES[correctIdx]?.activeBg} flex items-center justify-center text-sm font-bold shadow-md`}>{SHAPES[correctIdx]?.shape}</div>
                    <span className="text-lg font-bold text-white">{reveal.correct_text}</span>
                  </div>
                  {reveal.explanation && <p className="text-white/60 text-sm pt-2 border-t border-white/10">{reveal.explanation}</p>}
                </div>
              )}

              {/* Running totals */}
              <div className="flex items-center gap-3">
                {reveal.you_rank && (
                  <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-center">
                    <p className="text-white/50 text-[10px] uppercase tracking-wider">Posición</p>
                    <p className="text-white font-black text-xl flex items-center gap-1 justify-center"><Trophy className="w-4 h-4 text-amber-300" />#{reveal.you_rank.rank}</p>
                  </div>
                )}
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-center">
                  <p className="text-white/50 text-[10px] uppercase tracking-wider">Puntos</p>
                  <p className="text-amber-300 font-black text-xl tabular-nums"><AnimatedNumber value={myPoints} /></p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── LEADERBOARD ── */}
          {phase === 'leaderboard' && reveal && (
            <motion.div key="leaderboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full">
              <QuizLeaderboard
                entries={reveal.leaderboard ?? []}
                highlightParticipantId={myParticipantId}
                subtitle="Esperando la siguiente pregunta..."
              />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
