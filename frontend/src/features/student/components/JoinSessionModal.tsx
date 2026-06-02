import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { useToast } from '@/shared/hooks/use-toast';
import { sessionsService } from '@/shared/services/sessionsService';

interface JoinSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinSessionModal({ isOpen, onClose }: JoinSessionModalProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleJoin = async () => {
    if (code.trim().length !== 6) {
      toast({
        title: 'Código inválido',
        description: 'Ingresa el código de 6 caracteres de tu clase.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const session = await sessionsService.joinByCode(code.trim().toUpperCase());
      toast({
        title: '¡Bienvenido!',
        description: `Te has unido a ${session.title}`,
        variant: 'default',
      });
      setCode('');
      onClose();
      navigate(`/session/${session.id}/student`);
    } catch (err: any) {
      let errorMsg = 'Verifica el código con tu instructor.';
      const data = err.response?.data;
      if (data) {
        if (typeof data === 'string') {
          errorMsg = data;
        } else if (data.join_code) {
          errorMsg = Array.isArray(data.join_code) ? data.join_code[0] : data.join_code;
        } else if (data.non_field_errors) {
          errorMsg = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors;
        } else if (data.detail) {
          errorMsg = data.detail;
        }
      }
      toast({
        title: 'Error al unirse',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCode('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unirse a una Clase</DialogTitle>
          <DialogDescription>
            Solicita el código de acceso a tu profesor e ingresa los 6 caracteres aquí.
          </DialogDescription>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-4"
        >
          {/* Code Input */}
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
              }
              placeholder="ABC123"
              className="pl-10 h-12 text-center text-2xl font-bold tracking-[0.3em] uppercase bg-muted border-0 focus-visible:ring-2 focus-visible:ring-primary"
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleJoin()}
              maxLength={6}
              disabled={isLoading}
              autoFocus
            />
          </div>

          {/* Progress indicator */}
          <div className="flex gap-1.5 justify-center">
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={{
                  scaleX: i < code.length ? 1 : 0.5,
                  opacity: i < code.length ? 1 : 0.3,
                }}
                className="h-1 flex-1 rounded-full bg-primary origin-left"
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 sidebar-gradient border-0 text-white gap-2"
              onClick={handleJoin}
              disabled={isLoading || code.length !== 6}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Ingresando...' : 'Entrar'}
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
