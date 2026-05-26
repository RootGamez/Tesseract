import React, { useState, useEffect } from 'react';
import { Wheel } from 'react-custom-roulette';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';

interface Participant {
  id: string;
  name: string;
}

interface RouletteWheelProps {
  open: boolean;
  onClose: () => void;
  participants: Participant[];
  /**
   * Called when a spin finishes with the selected participant id.
   */
  onResult: (winnerId: string) => void;
}

export default function RouletteWheel({ open, onClose, participants, onResult }: RouletteWheelProps) {
  const [mustStartSpinning, setMustStartSpinning] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [usedIds, setUsedIds] = useState<string[]>([]);

  // Build data for the wheel
  const data = participants.map((p) => ({
    option: p.name,
    style: { backgroundColor: '#ffb400', textColor: '#000' },
  }));

  // Reset wheel when dialog opens
  useEffect(() => {
    if (open) {
      setMustStartSpinning(false);
      setPrizeNumber(0);
      setUsedIds([]);
    }
  }, [open]);

  const startSpin = () => {
    const remaining = participants.filter((p) => !usedIds.includes(p.id));
    if (remaining.length === 0) {
      // All participants have been selected, reset.
      setUsedIds([]);
      return;
    }
    const randomIdx = Math.floor(Math.random() * remaining.length);
    const winner = remaining[randomIdx];
    const winnerIndex = participants.findIndex((p) => p.id === winner.id);
    setPrizeNumber(winnerIndex);
    setMustStartSpinning(true);
    // Store winner id for callback after spin completes.
    setUsedIds((prev) => [...prev, winner.id]);
  };

  const handleStopSpinning = () => {
    const winner = participants[prizeNumber];
    if (winner) {
      onResult(winner.id);
    }
    setMustStartSpinning(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-background text-foreground border border-border">
        <DialogHeader>
          <DialogTitle>Ruleta de Participantes</DialogTitle>
          <DialogDescription>
            Gira la rueda para seleccionar aleatoriamente a un estudiante. Cada estudiante solo puede ser seleccionado una
            vez por sesión.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {participants.length > 0 ? (
            <Wheel
              mustStartSpinning={mustStartSpinning}
              prizeNumber={prizeNumber}
              data={data}
              backgroundColors={["#ffefc5", "#f7d27c"]}
              textColors={["#000", "#000"]}
              onStopSpinning={handleStopSpinning}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No hay participantes disponibles.</p>
          )}
          <Button onClick={startSpin} disabled={mustStartSpinning || participants.length === 0} className="mt-2">
            {mustStartSpinning ? 'Girando…' : 'Girar'}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mustStartSpinning}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
