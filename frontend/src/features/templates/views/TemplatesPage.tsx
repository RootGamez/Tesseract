import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Clock, Copy, Edit3, Loader2, Plus, Play, Trash2, Zap } from 'lucide-react';
import { Topbar } from '@/shared/components/layout/Topbar';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { useToast } from '@/shared/hooks/use-toast';
import { useConfirm } from '@/shared/components/ui/confirm-dialog';
import { sessionsService } from '@/shared/services/sessionsService';
import { templatesService, type ClassTemplate } from '@/shared/services/templatesService';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

const TEMPLATE_GRADIENTS = ['card-gradient-blue', 'card-gradient-orange', 'card-gradient-green'];

function getGradient(index: number) {
  return TEMPLATE_GRADIENTS[index % TEMPLATE_GRADIENTS.length];
}

function getIcon(index: number) {
  return [BookOpen, Zap, Clock][index % 3];
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [templates, setTemplates] = useState<ClassTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await templatesService.list();
        setTemplates(data);
      } catch {
        setError('No pudimos cargar las plantillas. Intenta nuevamente.');
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const openCreateDialog = () => {
    setNewTitle('');
    setNewDescription('');
    setCreateFormOpen(true);
  };

  const openEditDialog = (template: ClassTemplate) => {
    navigate(`/templates/builder/${template.id}`);
  };

  const handleCreateTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim(),
        is_public: false,
        estimated_duration_minutes: 60,
        tags: [],
        stages: [],
      };
      const created = await templatesService.create(payload);
      setCreateFormOpen(false);
      toast({ title: 'Plantilla creada', description: 'Redirigiendo al editor...' });
      navigate(`/templates/builder/${created.id}`);
    } catch (err: any) {
      console.error('Error creando plantilla', err);
      toast({
        title: 'Error al crear plantilla',
        description: err?.response?.data?.detail || err.message || 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: ClassTemplate) => {
    const confirmed = await confirm({
      title: 'Eliminar plantilla',
      description: `¿Seguro que deseas eliminar "${template.title}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      tone: 'destructive',
    });
    if (!confirmed) return;

    setBusyId(template.id);
    try {
      await templatesService.delete(template.id);
      setTemplates(current => current.filter(item => item.id !== template.id));
      toast({
        title: 'Plantilla eliminada',
        description: 'La plantilla fue borrada del sistema.',
      });
    } catch {
      toast({
        title: 'No se pudo eliminar',
        description: 'Intenta nuevamente en unos segundos.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleClone = async (template: ClassTemplate) => {
    setBusyId(template.id);
    try {
      const clonedTemplate = await templatesService.clone(template.id);
      setTemplates(current => [clonedTemplate, ...current]);
      toast({
        title: 'Plantilla duplicada',
        description: 'Se creó una copia editable.',
      });
    } catch {
      toast({
        title: 'No se pudo duplicar',
        description: 'Revisa tus permisos e intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleUse = async (template: ClassTemplate) => {
    setBusyId(template.id);
    try {
      const session = await sessionsService.create({
        title: `${template.title}`,
        template_id: template.id,
      });
      toast({
        title: 'Clase creada desde plantilla',
        description: 'Entrando al Director de Orquesta.',
      });
      navigate(`/session/${session.id}/instructor`);
    } catch {
      toast({
        title: 'No se pudo usar la plantilla',
        description: 'Intenta nuevamente o revisa la conexión al backend.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const templateCount = templates.length;

  return (
    <div className="animate-fade-in">
      <Topbar title="Plantillas" subtitle="Reutiliza estructuras de clase que ya funcionan" />
      <div className="p-6 space-y-6">
        <div className="flex justify-end">
          <Button className="sidebar-gradient border-0 text-white gap-2" onClick={openCreateDialog}>
            <Plus className="w-4 h-4" /> Nueva Plantilla
          </Button>
        </div>

        {error && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Reintentar
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="border-border shadow-card animate-pulse">
                <CardContent className="p-0">
                  <div className="h-24 bg-muted/70 rounded-t-lg" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 w-2/3 rounded bg-muted" />
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-4/5 rounded bg-muted" />
                    <div className="flex gap-2 pt-2">
                      <div className="h-9 flex-1 rounded bg-muted" />
                      <div className="h-9 flex-1 rounded bg-muted" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templateCount === 0 ? (
          <Card className="border-dashed border-2 border-border">
            <CardContent className="min-h-[280px] flex flex-col items-center justify-center gap-4 text-center p-8">
              <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-current text-muted-foreground flex items-center justify-center">
                <BookOpen className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="font-semibold text-base">Todavía no tienes plantillas</h3>
                <p className="text-sm text-muted-foreground">
                  Crea tu primera estructura de clase para reutilizarla en futuras sesiones.
                </p>
              </div>
              <Button className="sidebar-gradient border-0 text-white gap-2" onClick={openCreateDialog}>
                <Plus className="w-4 h-4" /> Nueva Plantilla
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <AnimatePresence>
              {templates.map((template, index) => {
                const stageCount = template.stage_count || template.stages?.length || 0;
                const Icon = getIcon(index);
                const isBusy = busyId === template.id;

                return (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ delay: index * 0.06 }}
                  >
                    <Card className="border-border shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 group overflow-hidden h-full">
                      <CardContent className="p-0 flex flex-col h-full">
                        <div className={`${getGradient(index)} p-5 flex items-start justify-between gap-3`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-white truncate">{template.title}</h3>
                              <div className="flex items-center gap-2 flex-wrap mt-1">
                                <Badge className="bg-white/20 text-white border-0 text-[10px]">
                                  {stageCount} etapas
                                </Badge>
                                <Badge className="bg-white/15 text-white border-0 text-[10px]">
                                  {template.estimated_duration_minutes} min
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-white hover:bg-white/15"
                            onClick={() => handleDelete(template)}
                            disabled={isBusy}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="p-4 flex flex-col gap-4 flex-1">
                          <div className="space-y-2 flex-1">
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {template.description || 'Sin descripción todavía.'}
                            </p>

                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {template.is_public ? 'Pública' : 'Privada'}
                              </Badge>
                              {template.tags?.slice(0, 3).map(tag => (
                                <Badge key={tag} variant="outline" className="text-[10px] capitalize">
                                  {tag}
                                </Badge>
                              ))}
                            </div>

                            <p className="text-[11px] text-muted-foreground">
                              {template.owner?.display_name ? `Propietario: ${template.owner.display_name}` : 'Plantilla propia'}
                            </p>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1.5"
                              onClick={() => openEditDialog(template)}
                              disabled={isBusy}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1.5"
                              onClick={() => handleClone(template)}
                              disabled={isBusy}
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Clonar
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs gap-1.5 sidebar-gradient border-0 text-white"
                              onClick={() => handleUse(template)}
                              disabled={isBusy}
                            >
                              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              Usar
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Add new card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: templates.length * 0.06 }}>
              <Card
                className="border-dashed border-2 border-border hover:border-primary/50 transition-colors cursor-pointer h-full min-h-[240px] flex items-center justify-center group"
                onClick={openCreateDialog}
              >
                <CardContent className="flex flex-col items-center gap-3 text-muted-foreground group-hover:text-primary transition-colors">
                  <div className="w-12 h-12 rounded-xl border-2 border-dashed border-current flex items-center justify-center">
                    <Plus className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-sm">Crear nueva plantilla</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </div>

      <Dialog open={createFormOpen} onOpenChange={setCreateFormOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nueva Plantilla</DialogTitle>
            <DialogDescription>
              Ingresa el nombre y la descripción para inicializar la plantilla. Luego agregarás las escenas y contenido.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTemplateSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="title">Título de la plantilla *</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Ej. Clase 3: Vectores en el espacio"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <textarea
                id="description"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="Describe brevemente el objetivo de esta sesión..."
                rows={3}
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateFormOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" className="sidebar-gradient border-0 text-white" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear y Diseñar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
