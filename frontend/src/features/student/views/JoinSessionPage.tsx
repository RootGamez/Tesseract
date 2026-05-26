import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Hash, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useToast } from '@/shared/hooks/use-toast';
import { sessionsService } from '@/shared/services/sessionsService';
import { Toaster } from '@/shared/components/ui/toaster';

export default function JoinSessionPage() {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleJoin = async () => {
    if (code.trim().length !== 6) {
      toast({ title: 'Código inválido', description: 'Ingresa el código de 6 caracteres de tu clase.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const session = await sessionsService.joinByCode(code.trim().toUpperCase());
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
      toast({ title: 'Error al unirse', description: errorMsg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen sidebar-gradient flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-10 right-10 w-56 h-56 rounded-full bg-yellow-300 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white">Unirse a Clase</h1>
          <p className="text-white/70 mt-2">Ingresa el código que te dio tu instructor</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardContent className="pt-6 space-y-5">
            <div className="relative">
              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="ABC123"
                className="pl-11 h-14 text-center text-2xl font-bold tracking-[0.4em] uppercase bg-muted border-0 focus-visible:ring-2 focus-visible:ring-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={6}
              />
            </div>

            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full transition-all duration-200 ${
                    i < code.length ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>

            <Button
              className="w-full h-12 text-base font-semibold sidebar-gradient border-0 text-white hover:opacity-90"
              onClick={handleJoin}
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              Entrar a la Clase
            </Button>

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => navigate('/login')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </motion.div>
      <Toaster />
    </div>
  );
}
