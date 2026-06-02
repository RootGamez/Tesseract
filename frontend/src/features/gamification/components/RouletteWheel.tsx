import { useState, useEffect, useRef, useMemo } from 'react';
import { Wheel } from 'react-custom-roulette';
import confetti from 'canvas-confetti';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Input } from '@/shared/components/ui/input';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Check, Search, Users, Trophy } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

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

const WHEEL_COLORS = ['#4f46e5', '#7c3aed'];

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
        style: { backgroundColor: WHEEL_COLORS[idx % 2], textColor: '#ffffff' },
      })),
    [activeParticipants],
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
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#4f46e5', '#7c3aed', '#ec4899', '#3b82f6', '#10b981'],
      });
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
          'bg-zinc-950/95 backdrop-blur-md border border-indigo-500/20 shadow-[0_0_50px_rgba(99,102,241,0.15)] text-zinc-100 transition-all duration-300',
          isStudent
            ? 'sm:max-w-[480px] w-[90vw] [&>button]:hidden p-6'
            : 'sm:max-w-[800px] w-[95vw] md:max-w-[850px]',
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold tracking-tight text-center md:text-left bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
            {isStudent ? 'Sorteo en Vivo' : 'Ruleta de Participantes'}
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            {isStudent
              ? 'El docente ha activado el sorteo de participación en tiempo real.'
              : 'Gira la rueda para seleccionar aleatoriamente a un estudiante. Selecciona a los estudiantes que deseas incluir en esta ronda.'}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'flex gap-6 py-2 transition-all duration-300',
            isStudent ? 'flex-col items-center' : 'flex-col md:flex-row',
          )}
        >
          {/* Panel izquierdo: selección de participantes (solo instructor) */}
          {!isStudent && (
            <div className="w-full md:w-72 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  Estudiantes ({selectedIds.length}/{participants.length})
                </h3>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <Input
                  placeholder="Buscar estudiante..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs bg-zinc-900 border-zinc-800 focus-visible:ring-indigo-500 text-zinc-100"
                  disabled={mustStartSpinning}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-[11px] h-8 bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800 hover:text-white"
                  onClick={() => setSelectedIds(participants.map((p) => p.id))}
                  disabled={mustStartSpinning || selectedIds.length === participants.length}
                >
                  Seleccionar todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-[11px] h-8 bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800 hover:text-white"
                  onClick={() => setSelectedIds([])}
                  disabled={mustStartSpinning || selectedIds.length === 0}
                >
                  Limpiar
                </Button>
              </div>

              <ScrollArea className="h-[280px] border border-zinc-800 rounded-lg p-1 bg-zinc-950/40">
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
                            isSelected ? 'hover:bg-zinc-800/50' : 'opacity-40 hover:bg-zinc-900',
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="text-[10px] bg-indigo-600 text-white font-bold">
                                {p.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate text-zinc-200">{p.name}</p>
                              {isUsed && (
                                <span className="text-[8px] text-zinc-400 bg-zinc-800 px-1 py-0.2 rounded font-mono">
                                  Ya participó
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 ml-2">
                            {isSelected ? (
                              <div className="w-4 h-4 rounded border border-indigo-500 bg-indigo-600 text-white flex items-center justify-center">
                                <Check className="w-3 h-3 text-white stroke-[3px]" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded border border-zinc-700 bg-zinc-900" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 text-center py-10">No se encontraron estudiantes</p>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Panel derecho: la rueda */}
          <div
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-4 py-2 min-h-[320px] transition-all',
              !isStudent && 'border-l border-zinc-800/60 pl-6',
            )}
          >
            {isStudent && (
              <div className="text-center mb-1">
                <p className="text-xs text-zinc-400 font-semibold tracking-wider uppercase">
                  {mustStartSpinning ? '¡Girando la ruleta!' : localWinner ? 'Tenemos un ganador' : 'Esperando sorteo...'}
                </p>
              </div>
            )}

            {activeParticipants.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="scale-90 sm:scale-100 origin-center max-w-full overflow-hidden flex items-center justify-center p-2 rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/10 shadow-[0_0_40px_rgba(99,102,241,0.15)]">
                  <Wheel
                    mustStartSpinning={mustStartSpinning}
                    prizeNumber={prizeNumber}
                    data={data}
                    backgroundColors={WHEEL_COLORS}
                    textColors={['#ffffff', '#ffffff']}
                    outerBorderColor="#1e1b4b"
                    outerBorderWidth={6}
                    innerRadius={15}
                    innerBorderColor="#09090b"
                    innerBorderWidth={5}
                    radiusLineColor="#1e1b4b"
                    radiusLineWidth={1.5}
                    onStopSpinning={handleStopSpinning}
                  />
                </div>

                {localWinner && (
                  <div className="w-full max-w-[280px] p-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.1)] text-center animate-pulse">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-indigo-300 font-medium mb-0.5">
                      <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                      ¡Estudiante Seleccionado!
                    </div>
                    <div className="text-base font-extrabold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent truncate">
                      {localWinner}
                    </div>
                  </div>
                )}

                {!isStudent && (
                  <Button
                    onClick={startSpin}
                    disabled={mustStartSpinning || activeParticipants.length === 0}
                    className="mt-2 w-44 py-5 font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.55)] border-0 transition-all duration-300 rounded-xl"
                  >
                    {mustStartSpinning ? 'Girando…' : 'Girar Ruleta'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center max-w-[260px] py-10">
                <Users className="w-10 h-10 text-zinc-700 animate-pulse" />
                <p className="text-xs text-zinc-500 leading-relaxed">
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
          <DialogFooter className="border-t border-zinc-800/80 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
