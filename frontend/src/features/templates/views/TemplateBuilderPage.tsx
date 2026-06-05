import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Zap, FolderOpen, Timer, Trophy, Plus, Trash2, ArrowUp, ArrowDown,
  Save, Play, CheckCircle2, AlertCircle, Loader2, Info, List, SlidersHorizontal
} from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Separator } from '@/shared/components/ui/separator';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/shared/components/ui/sheet';
import { useToast } from '@/shared/hooks/use-toast';
import { useConfirm } from '@/shared/components/ui/confirm-dialog';
import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';

// Services
import { templatesService, type TemplateStage } from '@/shared/services/templatesService';
import { resourceTypeForFile } from '@/shared/utils/resourceTypes';
import { FileUploadField } from '@/shared/components/ui/file-upload';
import { sessionsService } from '@/shared/services/sessionsService';
import { quizService } from '@/shared/services/quizService';
import apiClient from '@/shared/services/apiClient';

// Builder stage components
import BoardWrapper, { type BoardWrapperHandle } from '@/features/board/components/BoardWrapper';
import PDFStage from '@/features/presentations/components/PDFStage';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';

const STAGE_ICONS: Record<string, React.ElementType> = {
  BOARD: Zap,
  PDF: FolderOpen,
  PRESENTATION: FolderOpen,
  QUIZ: Trophy,
  GAME: Trophy,
  BREAK: Timer,
};

export default function TemplateBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Template Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [duration, setDuration] = useState(60);

  // Stages State
  const [stages, setStages] = useState<TemplateStage[]>([]);
  const [activeStageId, setActiveStageId] = useState<string>('');

  // Add-scene dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newStageTitle, setNewStageTitle] = useState('');
  const [newStageType, setNewStageType] = useState('BOARD');
  const [newStageDuration, setNewStageDuration] = useState('10');
  const [newStageFile, setNewStageFile] = useState<File | null>(null);
  const [newStageQuizId, setNewStageQuizId] = useState('');
  const [addingStage, setAddingStage] = useState(false);

  // Mobile drawers
  const [isStagesDrawerOpen, setIsStagesDrawerOpen] = useState(false);
  const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false);

  // PDF preview URLs per stage (object URLs from local uploads or downloaded template assets)
  const [localFileUrls, setLocalFileUrls] = useState<Record<string, string>>({});
  // Template files already persisted on the server (stageId is present on each resource)
  const [templateFiles, setTemplateFiles] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // File currently being uploaded for the active stage (drives the progress card).
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Quiz libraries
  const [savedQuizzes, setSavedQuizzes] = useState<any[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<any | null>(null);

  const activeStage = stages.find(s => s.id === activeStageId);

  // Fetch Template & Quizzes on Mount
  useEffect(() => {
    if (!id) return;
    const initPage = async () => {
      setLoading(true);
      try {
        const tData = await templatesService.get(id);
        setTitle(tData.title);
        setDescription(tData.description || '');
        setTags(tData.tags?.join(', ') || '');
        setDuration(tData.estimated_duration_minutes || 60);
        setStages(tData.stages || []);
        if (tData.stages && tData.stages.length > 0) {
          setActiveStageId(tData.stages[0].id || '');
        }

        const quizList = await quizService.listSavedQuizzes();
        setSavedQuizzes(quizList);

        // Load files already persisted on this template (so previews work on reopen).
        try {
          const files = await templatesService.listFiles(id);
          setTemplateFiles(files);
        } catch {
          setTemplateFiles([]);
        }
      } catch (err) {
        toast({
          title: 'Error al cargar plantilla',
          description: 'No se pudo obtener la información de la plantilla seleccionada.',
          variant: 'destructive',
        });
        navigate('/templates');
      } finally {
        setLoading(false);
      }
    };

    initPage();
  }, [id]);

  // Keep a ref to the latest preview URLs so we can revoke them once, on unmount,
  // without revoking still-in-use URLs whenever the map changes.
  const fileUrlsRef = useRef<Record<string, string>>({});
  useEffect(() => { fileUrlsRef.current = localFileUrls; }, [localFileUrls]);
  useEffect(() => {
    return () => {
      Object.values(fileUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Lazily download the persisted file for the active PDF/Presentation stage so it previews on reopen.
  useEffect(() => {
    if (!activeStage?.id) return;
    if (activeStage.stage_type !== 'PDF' && activeStage.stage_type !== 'PRESENTATION') return;
    if (localFileUrls[activeStage.id]) return; // already have a preview (just uploaded or downloaded)

    const resource = templateFiles.find(
      r => String(r.stage) === String(activeStage.id) && (r.resource_type === 'PDF' || r.resource_type === 'PRESENTATION')
    );
    if (!resource?.id) return;

    let alive = true;
    apiClient.get(`/api/v1/resources/${resource.id}/download/`, { responseType: 'blob' })
      .then(dl => {
        if (!alive) return;
        const url = URL.createObjectURL(dl.data as Blob);
        setLocalFileUrls(prev => (prev[activeStage.id!] ? prev : { ...prev, [activeStage.id!]: url }));
      })
      .catch(() => { /* preview is best-effort */ });
    return () => { alive = false; };
  }, [activeStageId, activeStage, templateFiles]);

  // Fetch Quiz details when active stage has a quiz
  useEffect(() => {
    const config = activeStage?.config as any;
    if (activeStage?.stage_type === 'QUIZ' && config?.quiz_id) {
      quizService.getSavedQuiz(config.quiz_id)
        .then(data => setSelectedQuiz(data))
        .catch(() => setSelectedQuiz(null));
    } else {
      setSelectedQuiz(null);
    }
  }, [activeStageId, activeStage]);

  // BoardWrapper reads the active stage from the orchestrator store, so keep that
  // store in sync with the builder's local selection. Without this the board never
  // initializes and edits are never emitted/saved.
  useEffect(() => {
    useOrchestratorStore.getState().syncState({ activeStageId });
  }, [activeStageId]);

  // Keep a ref to the latest stages so dispatchSceneInit never reads stale data.
  const stagesRef = useRef<TemplateStage[]>([]);
  useEffect(() => { stagesRef.current = stages; }, [stages]);

  // Imperative handle to flush the full board scene before saving.
  const boardRef = useRef<BoardWrapperHandle>(null);

  // Feed a stage's saved board content into BoardWrapper (it listens for 'board-update').
  const dispatchSceneInit = (stageId: string) => {
    const stage = stagesRef.current.find(s => s.id === stageId);
    if (!stage || stage.stage_type !== 'BOARD') return;
    const boardState = (stage.initial_board_state || {}) as any;
    window.dispatchEvent(new CustomEvent('board-update', {
      detail: {
        stage_id: stageId,
        event: 'SCENE_INIT',
        is_full_sync: true,
        elements: boardState.elements || [],
        files: boardState.files || {},
      },
    }));
  };

  // Fallback: re-send the scene shortly after switching to a board stage, in case
  // BoardWrapper's REQUEST_BOARD_SYNC fired before its canvas was ready.
  useEffect(() => {
    if (activeStage?.stage_type !== 'BOARD' || !activeStage.id) return;
    const stageId = activeStage.id;
    const timer = setTimeout(() => dispatchSceneInit(stageId), 200);
    return () => clearTimeout(timer);
  }, [activeStageId, activeStage]);

  // Handles BoardWrapper messages: persists edits (SCENE_UPDATE) and answers sync
  // requests (REQUEST_BOARD_SYNC) with the stage's stored content.
  const handleBoardUpdate = (
    channel: 'sessions' | 'chat' | 'board' | 'gamification',
    event: string,
    payload: any
  ) => {
    if (channel !== 'board') return;

    if (event === 'REQUEST_BOARD_SYNC') {
      // Defer a tick so BoardWrapper's 'board-update' listener is registered.
      const sid = payload?.stage_id || activeStageId;
      setTimeout(() => dispatchSceneInit(sid), 0);
      return;
    }

    if (event === 'SCENE_UPDATE' && activeStageId) {
      const { elements = [], appState, files } = payload;
      // onChange emits only the changed elements (a delta), so merge them by id into
      // the stage's accumulated scene instead of overwriting it (mirrors the backend).
      setStages(current => current.map(s => {
        if (s.id !== activeStageId) return s;
        const prevState = (s.initial_board_state || {}) as any;
        const byId = new Map<string, any>((prevState.elements || []).map((el: any) => [el.id, el]));
        for (const el of elements) {
          const existing = byId.get(el.id);
          if (!existing || (el.version ?? 0) >= (existing.version ?? 0)) byId.set(el.id, el);
        }
        const mergedFiles = files ? { ...(prevState.files || {}), ...files } : prevState.files;
        return {
          ...s,
          initial_board_state: {
            elements: Array.from(byId.values()),
            appState: appState ?? prevState.appState,
            ...(mergedFiles ? { files: mergedFiles } : {}),
          },
        };
      }));
    }
  };

  // Save changes to board before switching stages
  const handleStageChange = async (targetStageId: string) => {
    if (activeStageId === targetStageId) return;
    if (activeStage && activeStage.stage_type === 'BOARD') {
      await saveBoardState(activeStageId);
    }
    setActiveStageId(targetStageId);
  };

  const saveBoardState = async (stageId: string) => {
    // Push the full current scene (cancels any pending throttle) so the very last
    // strokes are merged into local state before we persist.
    try {
      await boardRef.current?.flushSnapshot();
    } catch { /* ignore */ }

    const stageToSave = stagesRef.current.find(s => s.id === stageId) || stages.find(s => s.id === stageId);
    if (stageToSave && stageToSave.stage_type === 'BOARD' && stageToSave.initial_board_state) {
      try {
        await templatesService.updateStage(id!, stageId, {
          initial_board_state: stageToSave.initial_board_state
        });
      } catch (err) {
        console.error('Failed to auto-save board state:', err);
      }
    }
  };

  const resetAddDialog = () => {
    setIsAddOpen(false);
    setNewStageTitle('');
    setNewStageType('BOARD');
    setNewStageDuration('10');
    setNewStageFile(null);
    setNewStageQuizId('');
  };

  // Add new stage (mirrors the live-class "add scene" flow)
  const handleAddStage = async () => {
    if (!newStageTitle.trim() || !id) return;

    if ((newStageType === 'PDF' || newStageType === 'PRESENTATION') && !newStageFile) {
      toast({
        title: 'Archivo requerido',
        description: 'Selecciona un archivo PDF o PPTX para esta escena antes de crearla.',
        variant: 'destructive',
      });
      return;
    }

    setAddingStage(true);
    try {
      const config: Record<string, unknown> = {};
      if (newStageType === 'QUIZ' && newStageQuizId) config.quiz_id = newStageQuizId;
      if ((newStageType === 'PDF' || newStageType === 'PRESENTATION') && newStageFile) config.filename = newStageFile.name;

      const payload = {
        title: newStageTitle.trim(),
        stage_type: newStageType,
        duration_estimated_minutes: Number(newStageDuration) || 10,
        config,
      };

      const newStage = await templatesService.addStage(id, payload);

      // Persist the chosen file on the template stage + keep an object URL for instant preview.
      if (newStage.id && newStageFile && (newStageType === 'PDF' || newStageType === 'PRESENTATION')) {
        const resourceType = resourceTypeForFile(newStageFile.name);
        // Documents are only viewable after server-side PDF conversion, so don't
        // create a local object-URL preview for them (pdf.js can't render the raw file).
        if (resourceType === 'PDF') {
          const url = URL.createObjectURL(newStageFile);
          setLocalFileUrls(prev => ({ ...prev, [newStage.id!]: url }));
        }
        try {
          const resource = await templatesService.uploadFile(id, newStage.id, newStageFile, resourceType);
          setTemplateFiles(prev => [...prev, resource]);
        } catch {
          toast({ title: 'Aviso', description: 'La escena se creó pero el archivo no se pudo guardar en el servidor.', variant: 'destructive' });
        }
      }

      setStages(prev => [...prev, newStage]);
      setActiveStageId(newStage.id || '');
      resetAddDialog();
      toast({ title: 'Escena agregada', description: `Se creó la escena "${payload.title}" correctamente.` });
    } catch {
      toast({ title: 'Error', description: 'No se pudo agregar la escena.', variant: 'destructive' });
    } finally {
      setAddingStage(false);
    }
  };

  // Delete stage
  const handleDeleteStage = async (stage: TemplateStage) => {
    if (!stage.id || !id) return;
    const ok = await confirm({
      title: 'Eliminar escena',
      description: `¿Seguro que deseas eliminar la escena "${stage.title}"?`,
      confirmText: 'Eliminar',
      tone: 'destructive',
    });
    if (!ok) return;

    try {
      await templatesService.deleteStage(id, stage.id);
      const updated = stages.filter(s => s.id !== stage.id);
      setStages(updated);
      if (activeStageId === stage.id && updated.length > 0) {
        setActiveStageId(updated[0].id || '');
      }
      toast({ title: 'Escena eliminada', description: `La escena fue eliminada de la plantilla.` });
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar la escena del servidor.', variant: 'destructive' });
    }
  };

  // Reorder stages (optimistic update, reverts on failure)
  const handleMoveStage = async (index: number, direction: 'up' | 'down') => {
    if (!id) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= stages.length) return;

    const previousStages = [...stages];
    const reordered = [...stages];
    [reordered[index], reordered[targetIdx]] = [reordered[targetIdx], reordered[index]];

    setStages(reordered);

    try {
      await templatesService.reorderStages(id, reordered.map(s => s.id!).filter(Boolean));
    } catch {
      setStages(previousStages);
      toast({ title: 'Error de ordenamiento', description: 'No se pudo persistir el nuevo orden en el servidor.', variant: 'destructive' });
    }
  };

  // Upload a PDF/PPTX for the active stage (in-center editing) and persist it on the template.
  const handlePdfUpload = async (file: File) => {
    if (!activeStageId || !id) return;
    const resourceType = resourceTypeForFile(file.name);
    // Documents need server-side PDF conversion before they can be previewed.
    if (resourceType === 'PDF') {
      const url = URL.createObjectURL(file);
      setLocalFileUrls(prev => ({ ...prev, [activeStageId]: url }));
    }
    setStages(current => current.map(s => (
      s.id === activeStageId ? { ...s, config: { ...s.config, filename: file.name } } : s
    )));

    setUploadingFile(true);
    setUploadProgress(0);
    setPendingFile(file);
    try {
      const resource = await templatesService.uploadFile(id, activeStageId, file, resourceType, setUploadProgress);
      setTemplateFiles(prev => [...prev.filter(r => String(r.stage) !== String(activeStageId)), resource]);
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar el archivo en el servidor.', variant: 'destructive' });
    } finally {
      setUploadingFile(false);
      setUploadProgress(null);
      setPendingFile(null);
    }
  };

  // Associate (or clear) Quiz ID on active stage config
  const handleSelectQuiz = (quizId: string) => {
    if (!activeStageId) return;
    setStages(current => current.map(s => {
      if (s.id === activeStageId) {
        const newConfig = { ...s.config };
        if (quizId) {
          newConfig.quiz_id = quizId;
        } else {
          delete newConfig.quiz_id;
        }
        return { ...s, config: newConfig };
      }
      return s;
    }));
  };

  // Persists current template metadata + all stage configs to the backend
  const persistTemplateChanges = async () => {
    if (!id) return;

    if (activeStage?.stage_type === 'BOARD') {
      await saveBoardState(activeStageId);
    }

    const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    await templatesService.update(id, {
      title: title.trim(),
      description: description.trim(),
      estimated_duration_minutes: duration,
      tags: parsedTags,
      is_public: false,
    });

    await Promise.all(
      stages
        .filter(s => s.id)
        .map(s =>
          templatesService.updateStage(id, s.id!, {
            title: s.title,
            duration_estimated_minutes: s.duration_estimated_minutes,
            config: s.config,
          })
        )
    );
  };

  const handleSaveAsTemplate = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await persistTemplateChanges();
      toast({ title: 'Plantilla guardada', description: 'La plantilla y todas sus escenas fueron guardadas con éxito.' });
      navigate('/templates');
    } catch {
      toast({ title: 'Error al guardar', description: 'Ocurrió un problema al guardar los datos.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsClass = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await persistTemplateChanges();

      toast({ title: 'Creando clase...', description: 'Inicializando sesión basándose en la plantilla...' });
      // The backend copies the template's stages, board state and uploaded files
      // into the new session, so there's nothing to re-upload here.
      const session = await sessionsService.create({
        title: title.trim(),
        template_id: id,
      });

      toast({ title: '¡Clase inicializada!', description: 'Redirigiendo al panel del instructor...' });
      navigate(`/session/${session.id}/instructor`);
    } catch {
      toast({ title: 'Error al iniciar clase', description: 'No se pudo inicializar la clase correctamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Reusable renderers (shared by desktop sidebars and mobile drawers) ──────────

  const renderStageList = (onNavigate?: () => void) => (
    <>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {stages.map((stage, idx) => {
            const Icon = STAGE_ICONS[stage.stage_type] ?? Zap;
            const isActive = stage.id === activeStageId;
            return (
              <div
                key={stage.id}
                className={cn(
                  'group relative p-2 rounded-lg cursor-pointer border transition-all flex items-center justify-between',
                  isActive ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted'
                )}
                onClick={() => { handleStageChange(stage.id || ''); onNavigate?.(); }}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={cn(
                    'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-xs font-semibold truncate', isActive ? 'text-primary' : 'text-foreground')}>
                      {idx + 1}. {stage.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono capitalize">
                      {stage.stage_type.toLowerCase().replace('_', ' ')} · {stage.duration_estimated_minutes} min
                    </p>
                  </div>
                </div>

                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveStage(idx, 'up'); }}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveStage(idx, 'down'); }}
                    disabled={idx === stages.length - 1}
                    className="text-muted-foreground hover:text-foreground p-0.5 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={async (e) => { e.stopPropagation(); await handleDeleteStage(stage); }}
                    className="text-muted-foreground hover:text-destructive p-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border">
        <Button
          onClick={() => { setIsAddOpen(true); onNavigate?.(); }}
          variant="outline"
          size="sm"
          className="w-full h-9 text-xs gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar Escena
        </Button>
      </div>
    </>
  );

  const renderDetails = () => (
    <div className="p-4 space-y-5 flex-1 overflow-y-auto">
      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">Título de la Clase / Plantilla *</Label>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Nombre descriptivo..."
          className="h-10 text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">Descripción general</Label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe el objetivo y flujo de la clase..."
          rows={4}
          className="w-full text-xs bg-background border border-input text-foreground rounded-md p-2.5 outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">Duración total aproximada (minutos)</Label>
        <Input
          type="number"
          value={duration}
          onChange={e => setDuration(Number(e.target.value) || 60)}
          className="h-10 text-xs"
        />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          * Suma de las escenas: {stages.reduce((acc, curr) => acc + (curr.duration_estimated_minutes || 0), 0)} min.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs">Etiquetas (separadas por comas)</Label>
        <Input
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="matemáticas, cálculo, vectores"
          className="h-10 text-xs"
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background h-screen text-foreground">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-sm">Cargando constructor de plantilla...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* ── TOPBAR ────────────────────────────────────── */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-3 sm:px-4 shrink-0 z-30 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={() => navigate('/templates')} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Separator orientation="vertical" className="h-5 hidden sm:block" />
          <div className="w-6 h-6 rounded-md sidebar-gradient flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm truncate min-w-0 text-foreground">
            {title || 'Sin título'}
          </span>
          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] hidden md:inline-flex shrink-0">
            CREADOR DE PLANTILLAS
          </Badge>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-2"
            onClick={handleSaveAsTemplate}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Guardar Plantilla</span>
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs sidebar-gradient border-0 text-white gap-2 hover:opacity-90"
            onClick={handleSaveAsClass}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Guardar e Iniciar Clase</span>
            <span className="sm:hidden">Iniciar</span>
          </Button>
        </div>
      </header>

      {/* ── MAIN BODY ─────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR — Stage list (desktop) */}
        <aside className="hidden lg:flex w-[240px] border-r border-border bg-card flex-col shrink-0">
          <div className="p-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Escenas en esta plantilla ({stages.length})
          </div>
          {renderStageList()}
        </aside>

        {/* LEFT SIDEBAR — Mobile drawer */}
        <Sheet open={isStagesDrawerOpen} onOpenChange={setIsStagesDrawerOpen}>
          <SheetContent side="left" className="p-0 w-[260px] border-r border-border bg-card flex flex-col h-full text-foreground">
            <div className="p-4 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Escenas en esta plantilla ({stages.length})
            </div>
            {renderStageList(() => setIsStagesDrawerOpen(false))}
          </SheetContent>
        </Sheet>

        {/* CENTER — Editor Area */}
        <main className="flex-1 relative bg-background flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            {!activeStage ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 text-center p-6 text-muted-foreground"
              >
                <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-2">
                  <Zap className="w-8 h-8 text-muted-foreground/60 animate-pulse" />
                </div>
                <h3 className="text-foreground text-base font-semibold">Plantilla vacía</h3>
                <p className="text-muted-foreground text-xs max-w-xs">
                  Comienza agregando tu primera escena (como una Pizarra o un Quiz) desde el panel lateral.
                </p>
                <Button
                  onClick={() => setIsAddOpen(true)}
                  className="sidebar-gradient border-0 text-white text-xs h-9 px-4 mt-2 hover:opacity-90"
                >
                  Agregar Escena
                </Button>
              </motion.div>
            ) : activeStage.stage_type === 'BOARD' ? (
              <div className="w-full h-full relative" key={activeStage.id}>
                <BoardWrapper ref={boardRef} role="instructor" sendMessage={handleBoardUpdate} />
                <div className="absolute top-3 right-3 bg-card/90 text-muted-foreground text-[10px] py-1 px-2.5 rounded-full border border-border pointer-events-none select-none flex items-center gap-1.5 backdrop-blur">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  Los trazos se guardan automáticamente
                </div>
              </div>
            ) : activeStage.stage_type === 'PDF' || activeStage.stage_type === 'PRESENTATION' ? (
              <div className="w-full h-full flex flex-col items-center justify-center" key={activeStage.id}>
                {localFileUrls[activeStage.id!] ? (
                  <PDFStage
                    sessionId="demo"
                    role="instructor"
                    localFileUrl={localFileUrls[activeStage.id!]}
                  />
                ) : (
                  <div className="w-full max-w-sm p-4">
                    <FileUploadField
                      file={pendingFile}
                      onSelect={handlePdfUpload}
                      onClear={() => setPendingFile(null)}
                      progress={uploadingFile ? (uploadProgress ?? 0) : null}
                      disabled={uploadingFile}
                      title="Subir presentación"
                    />
                  </div>
                )}
              </div>
            ) : activeStage.stage_type === 'QUIZ' ? (
              <div className="w-full h-full flex flex-col p-4 sm:p-6 overflow-y-auto" key={activeStage.id}>
                {!(activeStage.config as any)?.quiz_id ? (
                  <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-4">
                    <Trophy className="w-12 h-12 text-muted-foreground/60 animate-bounce" />
                    <div className="space-y-1">
                      <h4 className="text-foreground font-medium text-sm">Vincular Quiz</h4>
                      <p className="text-xs text-muted-foreground">
                        Selecciona uno de los quizzes guardados en tu biblioteca para esta escena.
                      </p>
                    </div>

                    <select
                      className="w-full h-10 rounded-md border border-input bg-background text-foreground px-3 text-xs outline-none focus:ring-1 focus:ring-ring"
                      onChange={e => handleSelectQuiz(e.target.value)}
                      defaultValue=""
                    >
                      <option value="" disabled>Selecciona un quiz de la lista...</option>
                      {savedQuizzes.map(q => (
                        <option key={q.id} value={q.id}>{q.title} ({q.questions?.length || q.question_count || 0} preguntas)</option>
                      ))}
                    </select>

                    {savedQuizzes.length === 0 && (
                      <p className="text-[11px] text-yellow-500 flex items-center gap-1.5 justify-center">
                        <AlertCircle className="w-3.5 h-3.5" />
                        No tienes quizzes guardados. Crea uno en Quiz Builder primero.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto w-full space-y-6">
                    <div className="flex items-center justify-between border-b border-border pb-3 gap-3">
                      <div className="min-w-0">
                        <Badge className="bg-primary/20 text-primary border-primary/20 mb-1">QUIZ SELECCIONADO</Badge>
                        <h3 className="text-foreground font-bold text-lg truncate">{selectedQuiz?.title || 'Cargando detalles...'}</h3>
                        <p className="text-xs text-muted-foreground truncate">{selectedQuiz?.description || 'Sin descripción'}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs shrink-0"
                        onClick={() => handleSelectQuiz('')}
                      >
                        Cambiar Quiz
                      </Button>
                    </div>

                    {selectedQuiz ? (
                      <div className="space-y-4">
                        <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Preguntas ({selectedQuiz.questions?.length || 0})</h4>
                        <div className="space-y-3">
                          {selectedQuiz.questions?.map((q: any, qIdx: number) => (
                            <div key={q.id || qIdx} className="p-4 rounded-xl bg-card border border-border space-y-3">
                              <p className="text-sm font-semibold text-foreground">{qIdx + 1}. {q.text || q.question_text}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {q.options?.map((o: any, oIdx: number) => (
                                  <div
                                    key={o.id || oIdx}
                                    className={cn(
                                      'p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between',
                                      o.is_correct
                                        ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                                        : 'bg-background border-border text-muted-foreground'
                                    )}
                                  >
                                    <span className="truncate">{o.text}</span>
                                    {o.is_correct && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 ml-2" />}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-center p-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <motion.div
                key={activeStageId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 text-center max-w-sm p-6"
              >
                <div className="w-16 h-16 rounded-2xl card-gradient-blue flex items-center justify-center shadow-lg">
                  {(() => {
                    const Icon = STAGE_ICONS[activeStage.stage_type] ?? Zap;
                    return <Icon className="w-8 h-8 text-white" />;
                  })()}
                </div>
                <div>
                  <h3 className="text-foreground text-lg font-bold">{activeStage.title}</h3>
                  <p className="text-muted-foreground text-xs mt-1 font-mono uppercase">Escena de tipo {activeStage.stage_type}</p>
                </div>
                <div className="p-4 rounded-lg bg-card border border-border text-left space-y-2 mt-2">
                  <div className="flex gap-2 items-start text-xs text-muted-foreground">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p>Esta escena no requiere pre-configuración compleja en el constructor. Iniciará vacía o con valores por defecto.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* RIGHT SIDEBAR — Details (desktop) */}
        <aside className="hidden xl:flex w-[280px] border-l border-border bg-card flex-col shrink-0">
          <div className="p-4 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Detalles de la Plantilla
          </div>
          {renderDetails()}
        </aside>

        {/* RIGHT SIDEBAR — Mobile drawer */}
        <Sheet open={isDetailsDrawerOpen} onOpenChange={setIsDetailsDrawerOpen}>
          <SheetContent side="right" className="p-0 w-[300px] border-l border-border bg-card flex flex-col h-full text-foreground">
            <div className="p-4 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Detalles de la Plantilla
            </div>
            {renderDetails()}
          </SheetContent>
        </Sheet>
      </div>

      {/* ── FOOTER TOOLBAR (mobile toggles) ────────────── */}
      <footer className="h-12 border-t border-border bg-card flex items-center justify-end gap-2 px-3 shrink-0 xl:hidden">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs gap-1.5 lg:hidden mr-auto"
          onClick={() => setIsStagesDrawerOpen(true)}
        >
          <List className="w-3.5 h-3.5" />
          Escenas
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs gap-1.5"
          onClick={() => setIsDetailsDrawerOpen(true)}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Detalles
        </Button>
      </footer>

      {/* ── ADD STAGE DIALOG (identical to the live-class flow) ─────────── */}
      <Dialog open={isAddOpen} onOpenChange={(o) => (o ? setIsAddOpen(true) : resetAddDialog())}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Agregar Nueva Escena
            </DialogTitle>
            <DialogDescription className="text-sm">
              Selecciona el tipo de escena para tu clase interactiva.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Título de la Escena</label>
              <Input
                placeholder="Ej. Pizarra de Dibujo Libre"
                value={newStageTitle}
                onChange={(e) => setNewStageTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duración Estimada (minutos)</label>
              <Input
                type="number"
                min={1} max={120}
                value={newStageDuration}
                onChange={(e) => setNewStageDuration(e.target.value)}
                className="w-24 font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Funcionalidad / Tipo de Escena
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* BOARD */}
                <div
                  onClick={() => setNewStageType('BOARD')}
                  className={cn(
                    'p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 flex flex-col gap-2 relative overflow-hidden',
                    newStageType === 'BOARD' ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', newStageType === 'BOARD' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-foreground">Pizarra</span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">Lienzo digital interactivo colaborativo.</p>
                  <Badge className="absolute top-2 right-2 bg-green-500/20 text-green-600 dark:text-green-400 border-0 text-[9px] px-1.5 py-0">Listo</Badge>
                </div>

                {/* PDF */}
                <div
                  onClick={() => setNewStageType('PDF')}
                  className={cn(
                    'p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 flex flex-col gap-2 relative overflow-hidden',
                    newStageType === 'PDF' ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', newStageType === 'PDF' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                      <FolderOpen className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-foreground">Visor PDF</span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">Presentaciones y diapositivas compartidas.</p>
                  <Badge className="absolute top-2 right-2 bg-primary/20 text-primary border-0 text-[9px] px-1.5 py-0">PDF</Badge>
                </div>

                {/* QUIZ */}
                <div
                  onClick={() => setNewStageType('QUIZ')}
                  className={cn(
                    'p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 flex flex-col gap-2 relative overflow-hidden',
                    newStageType === 'QUIZ' ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', newStageType === 'QUIZ' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                      <Trophy className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-foreground">Quiz</span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">Cuestionarios interactivos estilo Kahoot.</p>
                  <Badge className="absolute top-2 right-2 bg-green-500/20 text-green-600 dark:text-green-400 border-0 text-[9px] px-1.5 py-0">Listo</Badge>
                </div>
              </div>

              {(newStageType === 'PDF' || newStageType === 'PRESENTATION') && (
                <div className="mt-3">
                  <FileUploadField
                    file={newStageFile}
                    onSelect={setNewStageFile}
                    onClear={() => setNewStageFile(null)}
                    title="Subir presentación"
                  />
                </div>
              )}

              {newStageType === 'QUIZ' && (
                <div className="space-y-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 mt-3 animate-fade-in">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Seleccionar Quiz Guardado (Opcional)
                  </label>
                  <select
                    value={newStageQuizId}
                    onChange={(e) => {
                      const qId = e.target.value;
                      setNewStageQuizId(qId);
                      if (qId) {
                        const selected = savedQuizzes.find(q => q.id === qId);
                        if (selected) setNewStageTitle(selected.title);
                      }
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">-- Crear Quiz en Blanco --</option>
                    {savedQuizzes.map((quiz) => (
                      <option key={quiz.id} value={quiz.id}>
                        {quiz.title} ({quiz.question_count ?? quiz.questions?.length ?? 0} preg.)
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    Si seleccionas un quiz, se vinculará a esta escena.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={resetAddDialog} disabled={addingStage}>
              Cancelar
            </Button>
            <Button onClick={handleAddStage} disabled={addingStage || !newStageTitle.trim()} className="sidebar-gradient border-0 text-white">
              {addingStage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {addingStage ? 'Creando...' : 'Crear Escena'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
