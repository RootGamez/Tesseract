import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import type { ClassTemplate, TemplatePayload, TemplateStage, TemplateStagePayload } from '@/shared/services/templatesService';

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ClassTemplate | null;
  onSubmit: (payload: TemplatePayload) => Promise<ClassTemplate | void>;
  onAddStage: (templateId: string, payload: TemplateStagePayload) => Promise<ClassTemplate | void>;
  onDeleteStage: (templateId: string, stageId: string) => Promise<ClassTemplate | void>;
  submitting?: boolean;
}

interface TemplateFormState {
  title: string;
  description: string;
  estimated_duration_minutes: string;
  tags: string;
}

interface StageFormState {
  title: string;
  stage_type: string;
  duration_estimated_minutes: string;
}

interface DraftStage extends TemplateStagePayload {
  tempId: string;
}

const defaultTemplateForm: TemplateFormState = {
  title: '',
  description: '',
  estimated_duration_minutes: '45',
  tags: '',
};

const defaultStageForm: StageFormState = {
  title: '',
  stage_type: 'BOARD',
  duration_estimated_minutes: '10',
};

const STAGE_TYPES = [
  { value: 'BOARD', label: 'Pizarra' },
  { value: 'PDF', label: 'PDF' },
  { value: 'PRESENTATION', label: 'Presentación' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'CHAT_FOCUS', label: 'Chat' },
  { value: 'GAME', label: 'Juego' },
  { value: 'RESOURCE', label: 'Recursos' },
  { value: 'BREAK', label: 'Descanso' },
  { value: 'VIDEO', label: 'Video' },
];

export function TemplateDialog({
  open,
  onOpenChange,
  template,
  onSubmit,
  onAddStage,
  onDeleteStage,
  submitting = false,
}: TemplateDialogProps) {
  const [form, setForm] = useState<TemplateFormState>(defaultTemplateForm);
  const [stageForm, setStageForm] = useState<StageFormState>(defaultStageForm);
  const [draftStages, setDraftStages] = useState<DraftStage[]>([]);
  const [stageBusyId, setStageBusyId] = useState<string | null>(null);
  const [savingStage, setSavingStage] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(template ? {
      title: template.title,
      description: template.description || '',
      estimated_duration_minutes: String(template.estimated_duration_minutes || 45),
      tags: (template.tags || []).join(', '),
    } : defaultTemplateForm);
    setDraftStages([]);
    setStageForm(defaultStageForm);
  }, [open, template]);

  const stages = useMemo(() => template?.stages ?? draftStages, [draftStages, template]);

  const handleTemplateChange = (key: keyof TemplateFormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleStageChange = (key: keyof StageFormState, value: string) => {
    setStageForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const duration = Number(form.estimated_duration_minutes);
    const tags = form.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    await onSubmit({
      title: form.title.trim(),
      description: form.description.trim(),
      estimated_duration_minutes: Number.isFinite(duration) && duration > 0 ? duration : 45,
      tags,
      is_public: false,
      stages: template ? undefined : draftStages.map(({ tempId, ...stage }) => stage),
    });
  };

  const handleAddStage = async () => {
    if (!stageForm.title.trim()) return;

    const payload: TemplateStagePayload = {
      title: stageForm.title.trim(),
      stage_type: stageForm.stage_type,
      duration_estimated_minutes: Number(stageForm.duration_estimated_minutes) > 0
        ? Number(stageForm.duration_estimated_minutes)
        : 10,
    };

    if (!template) {
      setDraftStages(current => [...current, { ...payload, tempId: crypto.randomUUID() }]);
      setStageForm(defaultStageForm);
      return;
    }

    setSavingStage(true);
    try {
      await onAddStage(template.id, payload);
      setStageForm(defaultStageForm);
    } finally {
      setSavingStage(false);
    }
  };

  const handleRemoveDraftStage = (tempId: string) => {
    setDraftStages(current => current.filter(stage => stage.tempId !== tempId));
  };

  const handleRemoveStage = async (stage: TemplateStage) => {
    if (!template || !stage.id) return;

    setStageBusyId(stage.id);
    try {
      await onDeleteStage(template.id, stage.id);
    } finally {
      setStageBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          <DialogDescription>
            Define la estructura base de tu clase y las escenas que se reutilizarán luego.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="template-title">Título</Label>
            <Input
              id="template-title"
              value={form.title}
              onChange={e => handleTemplateChange('title', e.target.value)}
              placeholder="Ej. Clase magistral de álgebra"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="template-description">Descripción</Label>
            <textarea
              id="template-description"
              value={form.description}
              onChange={e => handleTemplateChange('description', e.target.value)}
              placeholder="Describe el flujo, actividades y objetivos de la clase"
              rows={4}
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="template-duration">Duración estimada (min)</Label>
              <Input
                id="template-duration"
                type="number"
                min="1"
                value={form.estimated_duration_minutes}
                onChange={e => handleTemplateChange('estimated_duration_minutes', e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="template-tags">Etiquetas</Label>
              <Input
                id="template-tags"
                value={form.tags}
                onChange={e => handleTemplateChange('tags', e.target.value)}
                placeholder="matemáticas, introducción, práctico"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-4 bg-muted/20">
              <div>
                <h4 className="text-sm font-semibold">Escenas de la plantilla</h4>
                <p className="text-xs text-muted-foreground">
                  Aquí defines el flujo de la clase: pizarra, PDF, presentación, quiz, chat, etc.
                  {!template && ' Las escenas se guardarán cuando crees la plantilla.'}
                </p>
              </div>

              <div className="space-y-3">
                {stages.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Todavía no agregaste escenas a esta plantilla.
                  </div>
                ) : (
                  stages.map((stage: any, index) => (
                    <div key={template ? stage.id ?? `${stage.title}-${index}` : (stage as DraftStage).tempId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {index + 1}. {stage.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {stage.stage_type} · {stage.duration_estimated_minutes} min
                        </p>
                      </div>
                      {template ? stage.id && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveStage(stage)}
                          disabled={stageBusyId === stage.id}
                        >
                          {stageBusyId === stage.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveDraftStage((stage as DraftStage).tempId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_0.7fr_auto]">
                <div className="grid gap-2">
                  <Label htmlFor="stage-title">Nueva escena</Label>
                  <Input
                    id="stage-title"
                    value={stageForm.title}
                    onChange={e => handleStageChange('title', e.target.value)}
                    placeholder="Ej. Introducción"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <select
                    value={stageForm.stage_type}
                    onChange={e => handleStageChange('stage_type', e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {STAGE_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="stage-duration">Min</Label>
                  <Input
                    id="stage-duration"
                    type="number"
                    min="1"
                    value={stageForm.duration_estimated_minutes}
                    onChange={e => handleStageChange('duration_estimated_minutes', e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    className="w-full gap-2 sidebar-gradient border-0 text-white"
                    onClick={handleAddStage}
                    disabled={savingStage || !stageForm.title.trim()}
                  >
                    {savingStage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Agregar
                  </Button>
                </div>
              </div>
            </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting || savingStage}>
              Cancelar
            </Button>
            <Button type="submit" className="sidebar-gradient border-0 text-white" disabled={submitting || savingStage}>
              {template ? 'Guardar cambios' : 'Crear plantilla'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
