import { useState } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, BookOpen, Clock, Zap } from 'lucide-react';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Separator } from '@/shared/components/ui/separator';
import { sessionsService } from '@/shared/services/sessionsService';
import { templatesService, type ClassTemplate } from '@/shared/services/templatesService';
import { useToast } from '@/shared/hooks/use-toast';
import { cn } from '@/shared/lib/utils';

const schema = z.object({
  title: z.string().min(4, 'Mínimo 4 caracteres').max(80, 'Máximo 80 caracteres'),
  template_id: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function CreateSessionPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ClassTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: '' },
  });

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await templatesService.list();
        setTemplates(data);
      } catch {
        setTemplates([]);
      } finally {
        setTemplatesLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const session = await sessionsService.create({
        title: data.title,
        template_id: selectedTemplate || undefined,
      });
      toast({ title: '¡Clase creada!', description: 'Redirigiendo al Director de Orquesta...' });
      navigate(`/session/${session.id}/instructor`);
    } catch {
      // Fallback for demo: navigate with mock id
      toast({ title: 'Clase creada (demo)', description: 'Backend no disponible, entrando en modo demo.' });
      navigate('/session/demo/instructor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <Topbar title="Nueva Clase" subtitle="Configura y lanza tu sesión" />
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" className="gap-2 -ml-2 text-muted-foreground" onClick={() => navigate('/sessions')}>
          <ArrowLeft className="w-4 h-4" /> Volver
        </Button>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Session name */}
          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Información de la Clase</CardTitle>
              <CardDescription>Dale un nombre descriptivo a tu sesión</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre de la clase *</label>
                <Input
                  placeholder="Ej. Introducción a Álgebra Lineal — Semana 3"
                  {...form.register('title')}
                  className="h-11"
                />
                {form.formState.errors.title && (
                  <p className="text-destructive text-xs">{form.formState.errors.title.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Template selection */}
          <Card className="border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Plantilla (opcional)</CardTitle>
              <CardDescription>Elige una estructura creada previamente en la sección de plantillas</CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-5">
              {templatesLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="p-4 rounded-xl border-2 border-border animate-pulse">
                      <div className="w-8 h-8 rounded-lg bg-muted mb-3" />
                      <div className="h-4 w-2/3 bg-muted rounded mb-2" />
                      <div className="h-3 w-full bg-muted rounded mb-2" />
                      <div className="h-3 w-1/2 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setSelectedTemplate(null)}
                  className={cn(
                    'p-4 rounded-xl border-2 cursor-pointer transition-all',
                    selectedTemplate === null ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-sm mb-1">Sin plantilla</p>
                  <p className="text-xs text-muted-foreground">Empezar desde cero</p>
                </motion.div>

                {templates.map((template, index) => {
                  const Icon = [BookOpen, Zap, Clock][index % 3];
                  return (
                  <motion.div
                    key={template.id}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={cn(
                      'p-4 rounded-xl border-2 cursor-pointer transition-all',
                      selectedTemplate === template.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg card-gradient-blue flex items-center justify-center mb-3">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <p className="font-semibold text-sm mb-1">{template.title}</p>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                    <p className="text-xs text-primary mt-2 font-medium">{template.stage_count || template.stages?.length || 0} etapas</p>
                  </motion.div>
                  );
                })}
              </div>
              )}
              {!templatesLoading && templates.length === 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  No tienes plantillas creadas aún. Ve a la sección Plantillas para crear una estructura reutilizable.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-3">
            <Button variant="outline" type="button" className="flex-1" onClick={() => navigate('/sessions')}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 sidebar-gradient border-0 text-white gap-2 hover:opacity-90"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Crear y Entrar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
