import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Zap, FolderOpen, Timer, Trophy, Plus, Trash2, ArrowUp, ArrowDown,
  Save, Play, CheckCircle2, AlertCircle, Loader2, Info
} from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Separator } from '@/shared/components/ui/separator';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { useToast } from '@/shared/hooks/use-toast';
import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';

// Services
import { templatesService, type TemplateStage } from '@/shared/services/templatesService';
import { sessionsService } from '@/shared/services/sessionsService';
import { quizService } from '@/shared/services/quizService';
import apiClient from '@/shared/services/apiClient';

// Builder stage components
import BoardWrapper from '@/features/board/components/BoardWrapper';
import PDFStage from '@/features/presentations/components/PDFStage';

const STAGE_ICONS: Record<string, React.ElementType> = {
  BOARD: Zap,
  PDF: FolderOpen,
  PRESENTATION: FolderOpen,
  QUIZ: Trophy,
  GAME: Trophy,
  BREAK: Timer,
};

const STAGE_TYPES = [
  { value: 'BOARD', label: 'Pizarra' },
  { value: 'PDF', label: 'PDF' },
  { value: 'PRESENTATION', label: 'Presentación Colaborativa' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'CHAT_FOCUS', label: 'Chat Enfocado' },
  { value: 'BREAK', label: 'Descanso' },
];

export default function TemplateBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

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

  // Dialogs
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newStageTitle, setNewStageTitle] = useState('');
  const [newStageType, setNewStageType] = useState('BOARD');
  const [newStageDuration, setNewStageDuration] = useState('10');
  const [addingStage, setAddingStage] = useState(false);

  // PDF Local Files dictionary (stageId -> File)
  const [localFiles, setLocalFiles] = useState<Record<string, File>>({});
  const [localFileUrls, setLocalFileUrls] = useState<Record<string, string>>({});

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

        // Load Quiz Libraries
        const quizList = await quizService.listSavedQuizzes();
        setSavedQuizzes(quizList);
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

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(localFileUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [localFileUrls]);

  // Fetch Quiz details when active stage has a quiz
  useEffect(() => {
    const config = activeStage?.config as any;
    if (activeStage?.stage_type === 'QUIZ' && config?.quiz_id) {
      const quizId = config.quiz_id;
      quizService.getSavedQuiz(quizId)
        .then(data => setSelectedQuiz(data))
        .catch(() => setSelectedQuiz(null));
    } else {
      setSelectedQuiz(null);
    }
  }, [activeStageId, activeStage]);

  // Dispatch custom board event to whiteboard wrapper on activeStage changes
  useEffect(() => {
    if (activeStage && activeStage.stage_type === 'BOARD') {
      const boardState = activeStage.initial_board_state || { elements: [] };
      const event = new CustomEvent('board-update', {
        detail: {
          stage_id: activeStage.id,
          event: 'SCENE_INIT',
          is_full_sync: true,
          elements: boardState.elements || [],
          files: boardState.files || {},
        }
      });
      const timer = setTimeout(() => {
        window.dispatchEvent(event);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeStageId]);

  // Mock sendMessage for Excalidraw interaction
  const handleBoardUpdate = (
    channel: 'sessions' | 'chat' | 'board' | 'gamification',
    event: string,
    payload: any
  ) => {
    if (channel === 'board' && event === 'SCENE_UPDATE' && activeStageId) {
      const { elements, appState } = payload;
      setStages(current => current.map(s => {
        if (s.id === activeStageId) {
          return {
            ...s,
            initial_board_state: {
              elements,
              appState,
            }
          };
        }
        return s;
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
    const stageToSave = stages.find(s => s.id === stageId);
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

  // Add new stage
  const handleAddStage = async () => {
    if (!newStageTitle.trim() || !id) return;
    setAddingStage(true);
    try {
      const payload = {
        title: newStageTitle.trim(),
        stage_type: newStageType,
        duration_estimated_minutes: Number(newStageDuration) || 10,
        config: {},
      };

      const newStage = await templatesService.addStage(id, payload);
      const updatedStages = [...stages, newStage];
      setStages(updatedStages);
      setActiveStageId(newStage.id || '');
      setIsAddOpen(false);
      setNewStageTitle('');
      setNewStageType('BOARD');
      setNewStageDuration('10');
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
    if (!window.confirm(`¿Seguro que deseas eliminar la escena "${stage.title}"?`)) return;

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

  // Reorder stages
  const handleMoveStage = async (index: number, direction: 'up' | 'down') => {
    if (!id) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= stages.length) return;

    const reordered = [...stages];
    const temp = reordered[index];
    reordered[index] = reordered[targetIdx];
    reordered[targetIdx] = temp;

    // Set local state first for quick UI update
    setStages(reordered);

    try {
      const stageIds = reordered.map(s => s.id!).filter(Boolean);
      await templatesService.reorderStages(id, stageIds);
    } catch {
      toast({ title: 'Error de ordenamiento', description: 'No se pudo persistir el nuevo orden en el servidor.', variant: 'destructive' });
    }
  };

  // Handle PDF file uploads locally
  const handlePdfUpload = (file: File) => {
    if (!activeStageId) return;
    const url = URL.createObjectURL(file);

    setLocalFiles(prev => ({ ...prev, [activeStageId]: file }));
    setLocalFileUrls(prev => ({ ...prev, [activeStageId]: url }));

    // Store filename in stage configuration
    setStages(current => current.map(s => {
      if (s.id === activeStageId) {
        return {
          ...s,
          config: {
            ...s.config,
            filename: file.name,
          }
        };
      }
      return s;
    }));
  };

  // Associate Quiz ID to active stage config
  const handleSelectQuiz = (quizId: string) => {
    if (!activeStageId) return;
    setStages(current => current.map(s => {
      if (s.id === activeStageId) {
        return {
          ...s,
          config: {
            ...s.config,
            quiz_id: quizId,
          }
        };
      }
      return s;
    }));
  };

  // Final Action: Save as Template
  const handleSaveAsTemplate = async () => {
    if (!id) return;
    setSaving(true);
    try {
      // Save current active board drawings first
      if (activeStage && activeStage.stage_type === 'BOARD') {
        await saveBoardState(activeStageId);
      }

      // Update metadata and stages details
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
      await templatesService.update(id, {
        title: title.trim(),
        description: description.trim(),
        estimated_duration_minutes: duration,
        tags: parsedTags,
        is_public: false,
      });

      // Update stage details like config or names
      for (const s of stages) {
        if (s.id) {
          await templatesService.updateStage(id, s.id, {
            title: s.title,
            duration_estimated_minutes: s.duration_estimated_minutes,
            config: s.config,
          });
        }
      }

      toast({ title: 'Plantilla guardada', description: 'La plantilla y todas sus escenas fueron guardadas con éxito.' });
      navigate('/templates');
    } catch (err) {
      toast({ title: 'Error al guardar', description: 'Ocurrió un problema al guardar los datos.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Final Action: Save as Class
  const handleSaveAsClass = async () => {
    if (!id) return;
    setSaving(true);
    try {
      // 1. Save template changes
      if (activeStage && activeStage.stage_type === 'BOARD') {
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

      for (const s of stages) {
        if (s.id) {
          await templatesService.updateStage(id, s.id, {
            title: s.title,
            duration_estimated_minutes: s.duration_estimated_minutes,
            config: s.config,
          });
        }
      }

      // 2. Create the live session
      toast({ title: 'Creando clase...', description: 'Inicializando sesión basándose en la plantilla...' });
      let session;
      try {
        session = await sessionsService.create({
          title: title.trim(),
          template_id: id,
        });
      } catch {
        // demo mode fallback
        toast({ title: 'Clase creada (demo)', description: 'Backend no disponible, entrando a modo demostración.' });
        navigate('/session/demo/instructor');
        return;
      }

      // 3. Upload staged PDF/Presentation files to session stages if any
      const stagedStageIds = Object.keys(localFiles);
      if (stagedStageIds.length > 0) {
        toast({ title: 'Sincronizando archivos', description: 'Cargando documentos pre-configurados a la clase...' });
        for (const stageId of stagedStageIds) {
          const file = localFiles[stageId];
          const ext = file.name.split('.').pop()?.toLowerCase();
          const type = ext === 'pdf' ? 'PDF' : 'PRESENTATION';

          const formData = new FormData();
          formData.append('file', file);
          formData.append('resource_type', type);
          formData.append('stage_id', stageId);

          try {
            await apiClient.post(`/api/v1/resources/sessions/${session.id}/upload/`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          } catch (uploadErr) {
            console.error('Failed to upload file for stage:', stageId, uploadErr);
          }
        }
      }

      toast({ title: '¡Clase inicializada!', description: 'Redirigiendo al panel del instructor...' });
      navigate(`/session/${session.id}/instructor`);
    } catch (err) {
      toast({ title: 'Error al iniciar clase', description: 'No se pudo inicializar la clase correctamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 h-screen text-white">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-zinc-400 text-sm">Cargando constructor de plantilla...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-foreground overflow-hidden">
      {/* ── TOPBAR ────────────────────────────────────── */}
      <header className="h-14 border-b border-border/40 bg-zinc-900 flex items-center justify-between px-4 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/templates')} className="text-muted-foreground hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Separator orientation="vertical" className="h-5 border-border/40" />
          <div className="w-6 h-6 rounded-md sidebar-gradient flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm truncate max-w-[240px] text-white">
            Diseñando: {title || 'Sin título'}
          </span>
          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
            CREADOR DE PLANTILLAS
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border/40 hover:bg-zinc-800 text-zinc-300 hover:text-white gap-2 bg-transparent"
            onClick={handleSaveAsTemplate}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar Plantilla
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs sidebar-gradient border-0 text-white gap-2 hover:opacity-90"
            onClick={handleSaveAsClass}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Guardar e Iniciar Clase
          </Button>
        </div>
      </header>

      {/* ── MAIN BODY ─────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT SIDEBAR — Stage list */}
        <aside className="w-[240px] border-r border-border/40 bg-zinc-900 flex flex-col shrink-0">
          <div className="p-3 border-b border-border/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Escenas en esta plantilla ({stages.length})
          </div>

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
                      isActive ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-zinc-800/60'
                    )}
                    onClick={() => handleStageChange(stage.id || '')}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                        isActive ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-400'
                      )}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-xs font-semibold truncate',
                          isActive ? 'text-primary' : 'text-zinc-300'
                        )}>
                          {idx + 1}. {stage.title}
                        </p>
                        <p className="text-[10px] text-zinc-500 font-mono capitalize">
                          {stage.stage_type.toLowerCase().replace('_', ' ')} · {stage.duration_estimated_minutes} min
                        </p>
                      </div>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveStage(idx, 'up'); }}
                        disabled={idx === 0}
                        className="text-zinc-500 hover:text-white p-0.5 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveStage(idx, 'down'); }}
                        disabled={idx === stages.length - 1}
                        className="text-zinc-500 hover:text-white p-0.5 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleDeleteStage(stage);
                        }}
                        className="text-zinc-500 hover:text-destructive p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-border/40">
            <Button
              onClick={() => setIsAddOpen(true)}
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs gap-1.5 border-border/40 text-zinc-300 hover:text-white bg-transparent hover:bg-zinc-800"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar Escena
            </Button>
          </div>
        </aside>

        {/* CENTER — Editor Area */}
        <main className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            {!activeStage ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 text-center p-6 text-zinc-400"
              >
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2">
                  <Zap className="w-8 h-8 text-zinc-700 animate-pulse" />
                </div>
                <h3 className="text-zinc-300 text-base font-semibold">Plantilla vacía</h3>
                <p className="text-zinc-500 text-xs max-w-xs">
                  Comienza agregando tu primera escena (como una Pizarra o un Quiz) desde el panel lateral izquierdo.
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
                {/* BoardWrapper with mock sendMessage */}
                <BoardWrapper
                  role="instructor"
                  sendMessage={handleBoardUpdate}
                />
                <div className="absolute top-3 right-3 bg-zinc-900/90 text-zinc-300 text-[10px] py-1 px-2.5 rounded-full border border-border/40 pointer-events-none select-none flex items-center gap-1.5 backdrop-blur">
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
                  <div className="p-8 max-w-sm rounded-xl border border-dashed border-zinc-800 text-center bg-zinc-900/40">
                    <FolderOpen className="w-10 h-10 text-zinc-600 mx-auto mb-4 animate-pulse" />
                    <h3 className="font-medium text-sm text-zinc-300 mb-1">Cargar Documento PDF</h3>
                    <p className="text-xs text-zinc-500 mb-4">
                      Sube el archivo PDF para previsualizarlo en este espacio del constructor y tenerlo listo para la clase.
                    </p>
                    <label className="inline-flex items-center justify-center cursor-pointer sidebar-gradient text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
                      <span>Elegir Archivo</span>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePdfUpload(file);
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            ) : activeStage.stage_type === 'QUIZ' ? (
              <div className="w-full h-full flex flex-col p-6 overflow-y-auto" key={activeStage.id}>
                {!(activeStage.config as any)?.quiz_id ? (
                  <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-4">
                    <Trophy className="w-12 h-12 text-zinc-700 animate-bounce" />
                    <div className="space-y-1">
                      <h4 className="text-zinc-300 font-medium text-sm">Vincular Quiz</h4>
                      <p className="text-xs text-zinc-500">
                        Selecciona uno de los quizzes que tienes guardados en tu biblioteca para esta escena.
                      </p>
                    </div>

                    <select
                      className="w-full h-10 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 px-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                      onChange={e => handleSelectQuiz(e.target.value)}
                      defaultValue=""
                    >
                      <option value="" disabled>Selecciona un quiz de la lista...</option>
                      {savedQuizzes.map(q => (
                        <option key={q.id} value={q.id}>{q.title} ({q.questions?.length || 0} preguntas)</option>
                      ))}
                    </select>

                    {savedQuizzes.length === 0 && (
                      <p className="text-[11px] text-yellow-500/80 flex items-center gap-1.5 justify-center">
                        <AlertCircle className="w-3.5 h-3.5" />
                        No tienes quizzes guardados. Crea uno en la sección Quiz Builder primero.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto w-full space-y-6">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div>
                        <Badge className="bg-primary/20 text-primary border-primary/20 mb-1">QUIZ SELECCIONADO</Badge>
                        <h3 className="text-white font-bold text-lg">{selectedQuiz?.title || 'Cargando detalles...'}</h3>
                        <p className="text-xs text-zinc-400">{selectedQuiz?.description || 'Sin descripción'}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs border-zinc-800 text-zinc-400 hover:text-white bg-transparent"
                        onClick={() => handleSelectQuiz('')}
                      >
                        Cambiar Quiz
                      </Button>
                    </div>

                    {selectedQuiz ? (
                      <div className="space-y-4">
                        <h4 className="text-zinc-300 text-xs font-semibold uppercase tracking-wider">Preguntas ({selectedQuiz.questions?.length || 0})</h4>
                        <div className="space-y-3">
                          {selectedQuiz.questions?.map((q: any, qIdx: number) => (
                            <div key={q.id || qIdx} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800/80 space-y-3">
                              <p className="text-sm font-semibold text-zinc-200">{qIdx + 1}. {q.text || q.question_text}</p>
                              <div className="grid grid-cols-2 gap-2">
                                {q.options?.map((o: any, oIdx: number) => (
                                  <div
                                    key={o.id || oIdx}
                                    className={cn(
                                      'p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between',
                                      o.is_correct
                                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                        : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                                    )}
                                  >
                                    <span>{o.text}</span>
                                    {o.is_correct && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 ml-2" />}
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
                className="flex flex-col items-center gap-4 text-center max-w-sm"
              >
                <div className="w-16 h-16 rounded-2xl card-gradient-blue flex items-center justify-center shadow-lg">
                  {(() => {
                    const Icon = STAGE_ICONS[activeStage.stage_type] ?? Zap;
                    return <Icon className="w-8 h-8 text-white" />;
                  })()}
                </div>
                <div>
                  <h3 className="text-white text-lg font-bold">{activeStage.title}</h3>
                  <p className="text-zinc-400 text-xs mt-1 font-mono uppercase">Escena de tipo {activeStage.stage_type}</p>
                </div>
                <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-left space-y-2 mt-2">
                  <div className="flex gap-2 items-start text-xs text-zinc-400">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p>Esta escena no requiere pre-configuración compleja en el constructor. Iniciará vacía o con los valores por defecto configurados.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* RIGHT SIDEBAR — Settings */}
        <aside className="w-[280px] border-l border-border/40 bg-zinc-900 flex flex-col shrink-0">
          <div className="p-4 border-b border-border/40 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Detalles de la Plantilla
          </div>

          <div className="p-4 space-y-5 flex-1 overflow-y-auto">
            {/* Template Title */}
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs">Título de la Clase / Plantilla *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Nombre descriptivo..."
                className="h-10 bg-zinc-950 border-zinc-800 text-white text-xs focus-visible:ring-primary"
              />
            </div>

            {/* Template Description */}
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs">Descripción general</Label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe el objetivo y flujo de la clase..."
                rows={4}
                className="w-full text-xs bg-zinc-950 border border-zinc-800 text-white rounded-md p-2.5 outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Total Duration (calculated or explicit) */}
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs">Duración total aproximada (minutos)</Label>
              <Input
                type="number"
                value={duration}
                onChange={e => setDuration(Number(e.target.value) || 60)}
                className="h-10 bg-zinc-950 border-zinc-800 text-white text-xs focus-visible:ring-primary"
              />
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                * Calculado automáticamente basado en la suma de las escenas: {stages.reduce((acc, curr) => acc + (curr.duration_estimated_minutes || 0), 0)} min.
              </p>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs">Etiquetas (separadas por comas)</Label>
              <Input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="matemáticas, cálculo, vectores"
                className="h-10 bg-zinc-950 border-zinc-800 text-white text-xs focus-visible:ring-primary"
              />
            </div>
          </div>
        </aside>
      </div>

      {/* ── ADD STAGE DIALOG ───────────────────────────── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[420px] bg-zinc-950 text-white border-zinc-800 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Nueva Escena</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Añade una escena al flujo de tu clase interactiva.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-zinc-400">Nombre de la escena *</Label>
              <Input
                value={newStageTitle}
                onChange={e => setNewStageTitle(e.target.value)}
                placeholder="Ej. Introducción al tema"
                className="h-10 bg-zinc-900 border-zinc-800 text-white text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Tipo de escena</Label>
              <select
                value={newStageType}
                onChange={e => setNewStageType(e.target.value)}
                className="w-full h-10 rounded-md border border-zinc-800 bg-zinc-900 text-white px-3 text-xs outline-none"
              >
                {STAGE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Duración estimada (minutos)</Label>
              <Input
                type="number"
                value={newStageDuration}
                onChange={e => setNewStageDuration(e.target.value)}
                className="h-10 bg-zinc-900 border-zinc-800 text-white text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:text-white bg-transparent" onClick={() => setIsAddOpen(false)} disabled={addingStage}>
                Cancelar
              </Button>
              <Button onClick={handleAddStage} className="sidebar-gradient border-0 text-white hover:opacity-90" disabled={addingStage}>
                {addingStage && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Agregar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
