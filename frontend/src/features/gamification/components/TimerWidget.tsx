import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Play, Pause, X, Clock } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface TimerData {
  timerId: string;
  label: string;
  endTimestampUtc: string | null;
  durationSeconds: number;
  isPaused: boolean;
  remainingSeconds: number;
}

interface TimerWidgetProps {
  role: 'student' | 'instructor';
  timerData: TimerData | null;
  sendMessage: (channel: 'gamification', event: string, payload: any) => void;
  openConfig?: boolean;
  onOpenConfigChange?: (open: boolean) => void;
}

export default function TimerWidget({
  role,
  timerData,
  sendMessage,
  openConfig = false,
  onOpenConfigChange
}: TimerWidgetProps) {
  const [remaining, setRemaining] = useState(0);

  // Selector inputs state
  const [minutesInput, setMinutesInput] = useState(5);
  const [secondsInput, setSecondsInput] = useState(0);
  const [customLabel, setCustomLabel] = useState('Actividad');

  const isInstructor = role === 'instructor';

  // Sync remaining seconds with UTC end time or paused state
  useEffect(() => {
    if (!timerData) {
      setRemaining(0);
      return;
    }

    if (timerData.isPaused) {
      setRemaining(timerData.remainingSeconds);
      return;
    }

    const calculateRemaining = () => {
      if (!timerData.endTimestampUtc) return 0;
      const endTime = new Date(timerData.endTimestampUtc).getTime();
      const diff = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      return diff;
    };

    setRemaining(calculateRemaining());

    const interval = setInterval(() => {
      const diff = calculateRemaining();
      setRemaining(diff);
      if (diff <= 0) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [timerData]);

  // Formatter for MM:SS
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // SVG Progress Ring calculations
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = timerData && timerData.durationSeconds > 0
    ? (remaining / timerData.durationSeconds) * 100
    : 0;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  // Presets handlers
  const handlePresetTime = (mins: number, secs: number = 0) => {
    setMinutesInput(mins);
    setSecondsInput(secs);
  };

  const handleStartTimer = () => {
    const totalDuration = minutesInput * 60 + secondsInput;
    if (totalDuration <= 0) return;

    sendMessage('gamification', 'TIMER_STARTED', {
      duration_seconds: totalDuration,
      label: customLabel.trim() || 'Temporizador'
    });

    if (onOpenConfigChange) onOpenConfigChange(false);
  };

  const handlePauseTimer = () => {
    if (!timerData) return;
    sendMessage('gamification', 'TIMER_PAUSED', {
      timer_id: timerData.timerId
    });
  };

  const handleResumeTimer = () => {
    if (!timerData) return;
    // Resume is starting a new timer with remaining seconds
    sendMessage('gamification', 'TIMER_STARTED', {
      duration_seconds: remaining,
      label: timerData.label
    });
  };

  const handleCancelTimer = () => {
    if (!timerData) return;
    sendMessage('gamification', 'TIMER_CANCELLED', {
      timer_id: timerData.timerId
    });
    if (onOpenConfigChange) onOpenConfigChange(false);
  };

  return (
    <>
      {/* ── FLOATING CORNER COUNTER ─────────────────────── */}
      {timerData && (
        <div
          onClick={() => isInstructor && onOpenConfigChange && onOpenConfigChange(true)}
          className={cn(
            "absolute top-4 right-4 z-40 flex items-center gap-3 bg-zinc-950/90 backdrop-blur-md border border-indigo-500/20 px-4 py-2.5 rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.15)] select-none animate-fade-in",
            isInstructor && "cursor-pointer hover:bg-zinc-900/90 hover:border-indigo-500/40 transition-all duration-300"
          )}
        >
          {/* Progress Circle SVG */}
          <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
            <svg className="w-8 h-8 transform -rotate-90">
              <circle
                className="text-zinc-800"
                strokeWidth="2.5"
                stroke="currentColor"
                fill="transparent"
                r={radius}
                cx="16"
                cy="16"
              />
              <circle
                className={cn(
                  "transition-all duration-500 ease-out",
                  remaining <= 10 && remaining > 0 && !timerData.isPaused ? "text-red-500" : "text-indigo-500"
                )}
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r={radius}
                cx="16"
                cy="16"
              />
            </svg>
            <Clock className="w-3.5 h-3.5 absolute text-zinc-400" />
          </div>

          {/* Time & Label Text */}
          <div className="min-w-[70px]">
            <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest leading-none mb-0.5 truncate max-w-[90px]">
              {timerData.label}
            </p>
            <p className={cn(
              "text-lg font-black font-mono leading-none tracking-tight",
              timerData.isPaused && "animate-pulse text-yellow-400",
              remaining <= 10 && remaining > 0 && !timerData.isPaused && "text-red-500 animate-pulse",
              !timerData.isPaused && remaining > 10 && "text-zinc-100"
            )}>
              {formatTime(remaining)}
            </p>
          </div>

          {/* Paused overlay indicator */}
          {timerData.isPaused && (
            <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
              Pausa
            </span>
          )}

          {/* Quick inline controls for Instructor on hover */}
          {isInstructor && (
            <div className="flex gap-1 border-l border-zinc-800/80 pl-2 ml-1 opacity-0 group-hover:opacity-100 md:flex">
              {timerData.isPaused ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResumeTimer();
                  }}
                  className="p-1 rounded bg-zinc-900 text-green-400 hover:text-green-300 hover:bg-zinc-800"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePauseTimer();
                  }}
                  className="p-1 rounded bg-zinc-900 text-yellow-400 hover:text-yellow-300 hover:bg-zinc-800"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelTimer();
                }}
                className="p-1 rounded bg-zinc-900 text-red-400 hover:text-red-300 hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── INSTRUCTOR CONFIGURATION MODAL ──────────────── */}
      {isInstructor && (
        <Dialog open={openConfig} onOpenChange={onOpenConfigChange}>
          <DialogContent className="bg-zinc-950 text-zinc-100 border border-zinc-800/80 shadow-[0_0_50px_rgba(99,102,241,0.15)] sm:max-w-[420px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                Gestión del Temporizador
              </DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                Sincroniza actividades con cuenta regresiva para toda la clase.
              </DialogDescription>
            </DialogHeader>

            {/* If a timer is already active, show management panel */}
            {timerData ? (
              <div className="space-y-4 my-2">
                <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-center space-y-2">
                  <span className={cn(
                    "text-[10px] uppercase tracking-widest font-black text-indigo-400 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20",
                    timerData.isPaused && "bg-yellow-500/10 text-yellow-400 border-yellow-500/25"
                  )}>
                    {timerData.isPaused ? 'Pausado' : 'Temporizador Activo'}
                  </span>
                  <h3 className="text-sm font-semibold text-zinc-400">{timerData.label}</h3>
                  <h1 className={cn(
                    "text-4xl font-mono font-black tracking-tight",
                    timerData.isPaused && "text-yellow-400 animate-pulse",
                    remaining <= 10 && remaining > 0 && !timerData.isPaused && "text-red-500 animate-pulse",
                    !timerData.isPaused && remaining > 10 && "text-white"
                  )}>
                    {formatTime(remaining)}
                  </h1>
                </div>

                <div className="flex gap-2">
                  {timerData.isPaused ? (
                    <Button
                      onClick={handleResumeTimer}
                      className="flex-1 h-10 bg-green-600 hover:bg-green-500 text-white font-bold text-xs gap-1.5 rounded-xl border-0"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Reanudar
                    </Button>
                  ) : (
                    <Button
                      onClick={handlePauseTimer}
                      className="flex-1 h-10 bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-xs gap-1.5 rounded-xl border-0"
                    >
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      Pausar
                    </Button>
                  )}
                  <Button
                    onClick={handleCancelTimer}
                    variant="destructive"
                    className="flex-1 h-10 font-bold text-xs gap-1.5 rounded-xl"
                  >
                    <X className="w-3.5 h-3.5" />
                    Detener / Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              /* If no timer is active, show setup panel */
              <div className="space-y-4 my-2">
                {/* Custom label selection */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Etiqueta del Temporizador
                  </Label>
                  <Input
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Ej. Actividad Grupal"
                    className="bg-zinc-900 border-zinc-800 text-white focus-visible:ring-indigo-500 text-xs h-9 placeholder:text-zinc-600"
                  />
                  <div className="flex gap-1 flex-wrap mt-1">
                    {['Actividad', 'Exposición', 'Trabajo Grupal', 'Descanso'].map(lbl => (
                      <button
                        key={lbl}
                        onClick={() => setCustomLabel(lbl)}
                        className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded border transition-colors",
                          customLabel === lbl 
                            ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/35"
                            : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800"
                        )}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration Inputs */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    Duración
                  </Label>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 flex flex-col items-center">
                      <Input
                        type="number"
                        min={0} max={99}
                        value={minutesInput}
                        onChange={(e) => setMinutesInput(Math.max(0, parseInt(e.target.value) || 0))}
                        className="bg-zinc-900 border-zinc-800 text-white font-mono font-bold text-center text-base h-10 w-full focus-visible:ring-indigo-500"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 font-medium">Minutos</span>
                    </div>
                    <span className="text-xl font-bold text-zinc-700 font-mono -mt-5">:</span>
                    <div className="flex-1 flex flex-col items-center">
                      <Input
                        type="number"
                        min={0} max={59}
                        value={secondsInput}
                        onChange={(e) => setSecondsInput(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="bg-zinc-900 border-zinc-800 text-white font-mono font-bold text-center text-base h-10 w-full focus-visible:ring-indigo-500"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 font-medium">Segundos</span>
                    </div>
                  </div>
                </div>

                {/* Duration Presets */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    Preajustes rápidos
                  </Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { l: '30 seg', m: 0, s: 30 },
                      { l: '1 min', m: 1, s: 0 },
                      { l: '2 min', m: 2, s: 0 },
                      { l: '3 min', m: 3, s: 0 },
                      { l: '5 min', m: 5, s: 0 },
                      { l: '10 min', m: 10, s: 0 }
                    ].map(preset => (
                      <Button
                        key={preset.l}
                        variant="outline"
                        size="sm"
                        onClick={() => handlePresetTime(preset.m, preset.s)}
                        className={cn(
                          "h-8 text-[11px] bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800 hover:text-white",
                          minutesInput === preset.m && secondsInput === preset.s && "bg-indigo-600/20 text-indigo-400 border-indigo-500/35 hover:bg-indigo-600/20 hover:text-indigo-400"
                        )}
                      >
                        {preset.l}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Controls */}
                <div className="pt-2 border-t border-zinc-800/80">
                  <Button
                    onClick={handleStartTimer}
                    disabled={minutesInput * 60 + secondsInput <= 0}
                    className="w-full h-10 font-extrabold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.25)] hover:shadow-[0_0_25px_rgba(99,102,241,0.45)] border-0 transition-all rounded-xl"
                  >
                    Iniciar Temporizador
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
