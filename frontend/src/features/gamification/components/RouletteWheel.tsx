import { useState, useEffect, useRef, useMemo } from 'react';
import { Wheel } from 'react-custom-roulette';
import confetti from 'canvas-confetti';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Input } from '@/shared/components/ui/input';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Check, Search, Users, Trophy, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useThemeColors } from '@/shared/hooks/useThemeColors';
import { quizSound } from '@/shared/lib/quizSounds';
import { useQuizSound } from '@/shared/hooks/useQuizSound';

interface Participant {
  id: string;
  name: string;
}

interface RouletteWheelProps {
  open: boolean;
  participants: Participant[];
  isStudent?: boolean;
  onClose?: () => void;
  // ── Instructor callbacks ──
  /** Emitido cuando la selección activa cambia (para sincronizar la lista al alumno). */
  onActiveParticipantsChange?: (active: Participant[]) => void;
  /** Emitido al iniciar un giro. spinId es un token único por giro. */
  onSpin?: (payload: { spinId: number; winnerId: string; winnerName: string }) => void;
  /** Emitido cuando el giro termina y hay ganador. */
  onResult?: (winnerId: string) => void;
  // ── Sincronización en modo alumno ──
  spinId?: number | null;
  winnerId?: string | null;
  winnerName?: string | null;
}

export default function RouletteWheel({
  open,
  participants,
  isStudent = false,
  onClose,
  onActiveParticipantsChange,
  onSpin,
  onResult,
  spinId,
  winnerId,
  winnerName,
}: RouletteWheelProps) {
  const [mustStartSpinning, setMustStartSpinning] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [localWinner, setLocalWinner] = useState<string | null>(null);

  // ── Colores del tema actual (claro/oscuro) ────────────────────────────────────
  const theme = useThemeColors();
  const { muted, toggle: toggleMute } = useQuizSound();
  const wheelColors = useMemo(() => [theme.primary, theme.accent], [theme.primary, theme.accent]);
  const wheelTextColors = useMemo(
    () => [theme['primary-foreground'], theme['accent-foreground']],
    [theme],
  );

  // ── Participantes activos en la rueda ────────────────────────────────────────
  // Instructor: los seleccionados en la lista. Alumno: lo que llega por sync.
  const activeParticipants = useMemo(
    () => (isStudent ? participants : participants.filter((p) => selectedIds.includes(p.id))),
    [isStudent, participants, selectedIds],
  );

  const data = useMemo(
    () =>
      activeParticipants.map((p, idx) => ({
        option: p.name.length > 16 ? `${p.name.slice(0, 15)}…` : p.name,
        style: { backgroundColor: wheelColors[idx % 2], textColor: wheelTextColors[idx % 2] },
      })),
    [activeParticipants, wheelColors, wheelTextColors],
  );

  // ── Instructor: emitir la lista activa solo cuando cambia de verdad ───────────
  const lastActiveKeyRef = useRef('');

  // ── Reset al abrir/cerrar ─────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setMustStartSpinning(false);
      setPrizeNumber(0);
      setUsedIds([]);
      setSearchQuery('');
      setLocalWinner(null);
      // Forzar reemisión de la lista activa al reabrir (el componente del
      // instructor no se desmonta, así que el ref persiste entre aperturas).
      lastActiveKeyRef.current = '';
      if (!isStudent) setSelectedIds(participants.map((p) => p.id));
    }
    // Solo al abrir; los cambios de participantes en vivo se manejan aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isStudent]);

  useEffect(() => {
    if (isStudent || !open || !onActiveParticipantsChange) return;
    const active = participants.filter((p) => selectedIds.includes(p.id));
    const key = active.map((p) => p.id).join(',');
    if (key === lastActiveKeyRef.current) return;
    lastActiveKeyRef.current = key;
    onActiveParticipantsChange(active);
  }, [selectedIds, open, isStudent, participants, onActiveParticipantsChange]);

  // ── Sonido: arrancar el giro (ambos roles) y limpiar al cerrar ────────────────
  useEffect(() => {
    if (mustStartSpinning) quizSound.rouletteStart();
  }, [mustStartSpinning]);

  useEffect(() => {
    if (open) quizSound.unlock(); // prime audio si ya hubo un gesto del usuario
    else quizSound.stopRoulette();
    return () => quizSound.stopRoulette();
  }, [open]);

  // ── Alumno: girar cuando llega un spinId nuevo (idempotente) ──────────────────
  const lastSpinIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isStudent || !open) return;
    if (spinId == null || spinId === lastSpinIdRef.current) return;
    lastSpinIdRef.current = spinId;
    const idx = participants.findIndex((p) => p.id === winnerId);
    setPrizeNumber(idx >= 0 ? idx : 0);
    setLocalWinner(null);
    setMustStartSpinning(true);
  }, [isStudent, open, spinId, winnerId, participants]);

  // ── Instructor: iniciar un giro ───────────────────────────────────────────────
  const startSpin = () => {
    if (isStudent || mustStartSpinning) return;

    let remaining = activeParticipants.filter((p) => !usedIds.includes(p.id));
    let nextUsed: string[];
    if (remaining.length === 0) {
      // Todos ya participaron → reiniciar la ronda.
      remaining = activeParticipants;
      nextUsed = [];
    } else {
      nextUsed = usedIds;
    }
    if (remaining.length === 0) return;

    const winner = remaining[Math.floor(Math.random() * remaining.length)];
    const winnerIndex = activeParticipants.findIndex((p) => p.id === winner.id);
    if (winnerIndex < 0) return;

    setPrizeNumber(winnerIndex);
    setUsedIds([...nextUsed, winner.id]);
    setLocalWinner(null);
    setMustStartSpinning(true);

    onSpin?.({ spinId: Date.now(), winnerId: winner.id, winnerName: winner.name });
  };

  // ── Fin del giro (ambos roles) ────────────────────────────────────────────────
  const handleStopSpinning = () => {
    setMustStartSpinning(false);
    const winner = activeParticipants[prizeNumber];
    const name = isStudent ? (winnerName ?? winner?.name ?? null) : (winner?.name ?? null);
    if (name) {
      setLocalWinner(name);
      quizSound.rouletteWin();
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: [theme.primary, theme.accent, theme.foreground].filter((c) => c && c !== 'transparent'),
      });
    } else {
      quizSound.stopRoulette();
    }
    if (!isStudent && winner) onResult?.(winner.id);
  };

  const filteredParticipants = participants.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isStudent) return; // el alumno no cierra manualmente
        if (!v) onClose?.();
      }}
    >
      <DialogContent
        onPointerDownOutside={(e) => isStudent && e.preventDefault()}
        onEscapeKeyDown={(e) => isStudent && e.preventDefault()}
        className={cn(
          'bg-background/95 backdrop-blur-md border border-border shadow-2xl text-foreground transition-all duration-300 max-h-[92vh] overflow-y-auto',
          isStudent
            ? 'w-[92vw] sm:max-w-[460px] [&>button]:hidden p-4 sm:p-6'
            : 'w-[95vw] sm:max-w-[760px] lg:max-w-[860px] p-4 sm:p-6',
        )}
      >
        {/* Silenciar / activar sonidos (también desbloquea el audio al pulsar) */}
        <button
          onClick={toggleMute}
          title={muted ? 'Activar sonido' : 'Silenciar'}
          className="absolute left-3 top-3 z-10 w-8 h-8 rounded-lg bg-muted hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <DialogHeader>
          <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-center md:text-left bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {isStudent ? 'Sorteo en Vivo' : 'Ruleta de Participantes'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs text-center md:text-left">
            {isStudent
              ? 'El docente ha activado el sorteo de participación en tiempo real.'
              : 'Gira la rueda para seleccionar aleatoriamente a un estudiante. Selecciona a los estudiantes que deseas incluir en esta ronda.'}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'flex gap-5 sm:gap-6 py-2 transition-all duration-300',
            isStudent ? 'flex-col items-center' : 'flex-col md:flex-row',
          )}
        >
          {/* Panel izquierdo: selección de participantes (solo instructor) */}
          {!isStudent && (
            <div className="w-full md:w-64 lg:w-72 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  Estudiantes ({selectedIds.length}/{participants.length})
                </h3>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar estudiante..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs"
                  disabled={mustStartSpinning}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-[11px] h-8"
                  onClick={() => setSelectedIds(participants.map((p) => p.id))}
                  disabled={mustStartSpinning || selectedIds.length === participants.length}
                >
                  Seleccionar todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-[11px] h-8"
                  onClick={() => setSelectedIds([])}
                  disabled={mustStartSpinning || selectedIds.length === 0}
                >
                  Limpiar
                </Button>
              </div>

              <ScrollArea className="h-[200px] md:h-[280px] border border-border rounded-lg p-1 bg-card/40">
                {filteredParticipants.length > 0 ? (
                  <div className="space-y-0.5">
                    {filteredParticipants.map((p) => {
                      const isSelected = selectedIds.includes(p.id);
                      const isUsed = usedIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          disabled={mustStartSpinning}
                          onClick={() =>
                            setSelectedIds((prev) =>
                              prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                            )
                          }
                          className={cn(
                            'w-full flex items-center justify-between p-2 rounded-md transition-colors text-left text-xs',
                            isSelected ? 'hover:bg-muted' : 'opacity-40 hover:bg-muted/50',
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="text-[10px] bg-primary text-primary-foreground font-bold">
                                {p.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate text-foreground">{p.name}</p>
                              {isUsed && (
                                <span className="text-[8px] text-muted-foreground bg-muted px-1 py-0.2 rounded font-mono">
                                  Ya participó
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 ml-2">
                            {isSelected ? (
                              <div className="w-4 h-4 rounded border border-primary bg-primary text-primary-foreground flex items-center justify-center">
                                <Check className="w-3 h-3 stroke-[3px]" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded border border-border bg-card" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-10">No se encontraron estudiantes</p>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Panel derecho: la rueda */}
          <div
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-4 py-2 min-h-[300px] w-full min-w-0 transition-all',
              !isStudent && 'md:border-l border-border md:pl-6',
            )}
          >
            {isStudent && (
              <div className="text-center mb-1">
                <p className="text-xs text-muted-foreground font-semibold tracking-wider uppercase">
                  {mustStartSpinning ? '¡Girando la ruleta!' : localWinner ? 'Tenemos un ganador' : 'Esperando sorteo...'}
                </p>
              </div>
            )}

            {activeParticipants.length > 0 ? (
              <div className="flex flex-col items-center gap-4 w-full">
                <div
                  className="roulette-fit w-full max-w-[260px] sm:max-w-[320px] md:max-w-[360px] mx-auto p-2 rounded-full border border-primary/15"
                  style={{
                    background: `radial-gradient(circle, ${theme.primary}1a, transparent 70%)`,
                  }}
                >
                  <Wheel
                    mustStartSpinning={mustStartSpinning}
                    prizeNumber={prizeNumber}
                    data={data}
                    backgroundColors={wheelColors}
                    textColors={wheelTextColors}
                    outerBorderColor={theme.border}
                    outerBorderWidth={6}
                    innerRadius={15}
                    innerBorderColor={theme.card}
                    innerBorderWidth={5}
                    radiusLineColor={theme.border}
                    radiusLineWidth={1.5}
                    onStopSpinning={handleStopSpinning}
                  />
                </div>

                {localWinner && (
                  <div className="w-full max-w-[280px] p-3 rounded-xl border border-primary/30 bg-primary/10 text-center animate-pulse">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-primary font-medium mb-0.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      ¡Estudiante Seleccionado!
                    </div>
                    <div className="text-base font-extrabold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent truncate">
                      {localWinner}
                    </div>
                  </div>
                )}

                {!isStudent && (
                  <Button
                    onClick={startSpin}
                    disabled={mustStartSpinning || activeParticipants.length === 0}
                    className="mt-2 w-44 py-5 font-bold text-sm sidebar-gradient text-white border-0 shadow-lg hover:opacity-95 transition-all duration-300 rounded-xl"
                  >
                    {mustStartSpinning ? 'Girando…' : 'Girar Ruleta'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center max-w-[260px] py-10">
                <Users className="w-10 h-10 text-muted-foreground/40 animate-pulse" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isStudent
                    ? 'Esperando que el instructor agregue participantes a la ruleta...'
                    : 'Selecciona al menos un estudiante de la lista lateral para activar la ruleta.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer (solo instructor): puede cerrar incluso girando → cierra también al alumno */}
        {!isStudent && (
          <DialogFooter className="border-t border-border pt-4">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
