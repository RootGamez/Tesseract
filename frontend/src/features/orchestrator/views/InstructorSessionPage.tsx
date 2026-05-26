import BoardWrapper, { type BoardWrapperHandle } from '@/features/board/components/BoardWrapper';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Zap, Users, MessageCircle, FolderOpen,
  Timer, Dices, Trophy, Wifi, WifiOff, Square, Play, Pause, Plus, Trash2,
  Copy, Link, UserPlus
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Separator } from '@/shared/components/ui/separator';
import { Input } from '@/shared/components/ui/input';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { useOrchestratorStore } from '../store/orchestratorStore';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { sessionsService } from '@/shared/services/sessionsService';
import { useToast } from '@/shared/hooks/use-toast';
import { cn } from '@/shared/lib/utils';
import RouletteWheel from '@/features/gamification/components/RouletteWheel';
import QuizBuilderPage from '@/features/quiz/views/QuizBuilderPage';
import { useQuizStore } from '@/features/quiz/store/useQuizStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';

const STAGE_ICONS: Record<string, React.ElementType> = {
  BOARD: Zap,
  PDF: FolderOpen,
  QUIZ: Trophy,
  GAME: Trophy, // Legacy stages: treat same as QUIZ
  BREAK: Timer,
};

export default function InstructorSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { stages, activeStageId, participants, sessionInfo } = useOrchestratorStore();
  const { isConnected, isReconnecting, sendMessage } = useWebSocket(id ?? null, 'instructor');
  const [activeTab, setActiveTab] = useState('clase');
  const [isRouletteOpen, setIsRouletteOpen] = useState(false);
  const handleSpinner = () => setIsRouletteOpen(true);
  const [points, setPoints] = useState('10');
  const [selectedParticipant, setSelectedParticipant] = useState('');
  const [sessionState, setSessionState] = useState<'LIVE' | 'PAUSED'>('LIVE');

  const [templateId, setTemplateId] = useState<string>('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [newStageTitle, setNewStageTitle] = useState('');
  const [newStageType, setNewStageType] = useState('BOARD');
  const [newStageDuration, setNewStageDuration] = useState('10');
  const [isCreatingStage, setIsCreatingStage] = useState(false);

  // Ref to active BoardWrapper so we can flush state before switching stages
  const boardRef = useRef<BoardWrapperHandle>(null);

  const activeStage = stages.find(s => s.id === activeStageId);
  const activeIdx = stages.findIndex(s => s.id === activeStageId);

  const fetchSession = async () => {
    if (!id) return;
    if (id === 'demo') {
      setTemplateId('demo-template');
      useOrchestratorStore.getState().syncState({
        sessionInfo: { title: 'Tesseract Live Class (Demo)', duration: 60 },
        stages: [
          { id: '1', title: 'Intro y Pizarra', type: 'BOARD', duration: 10, completed: true },
          { id: '2', title: 'Conceptos Clave', type: 'PDF', duration: 15, completed: false },
          { id: '3', title: 'Quiz 1', type: 'QUIZ', duration: 5, completed: false },
        ],
        activeStageId: '2',
        participants: [
          { id: 'p1', name: 'Ana García', points: 45, online: true },
          { id: 'p2', name: 'Luis Pérez', points: 20, online: true },
          { id: 'p3', name: 'María Gómez', points: 60, online: false },
        ],
      });
      return;
    }
    try {
      const session = await sessionsService.get(id);
      const mappedStages = (session.stages || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        type: s.stage_type,
        duration: s.duration_estimated_minutes,
        completed: false,
      }));

      // Fetch active participants
      let mappedParticipants: any[] = [];
      try {
        const participantsList = await sessionsService.getParticipants(id);
        mappedParticipants = (participantsList || []).map((p: any) => ({
          id: p.id,
          name: p.display_name,
          points: p.points,
          online: p.connection_status === 'ONLINE',
        }));
      } catch (err) {
        console.error('Error fetching participants:', err);
      }

      // Auto-initialize current stage on backend if null
      if (!session.current_stage && mappedStages[0]?.id) {
        sessionsService.changeStage(id, mappedStages[0].id).catch(err => {
          console.error('Failed to auto-initialize stage:', err);
        });
      }

      useOrchestratorStore.getState().syncState({
        sessionInfo: {
          title: session.title,
          duration: session.duration_seconds ? Math.round(session.duration_seconds / 60) : 60,
          join_code: session.join_code ?? '',
        },
        stages: mappedStages,
        activeStageId: session.current_stage?.id || (mappedStages[0]?.id || ''),
        participants: mappedParticipants,
      });
      setTemplateId(session.template_id || '');
      setSessionState(session.state === 'PAUSED' ? 'PAUSED' : 'LIVE');
    } catch (err) {
      console.error('Error fetching session:', err);
    }
  };

  useEffect(() => {
    if (id === 'undefined') {
      toast({
        title: 'Sesión no válida',
        description: 'La clase actual tiene un ID indefinido. Redirigiendo a la lista...',
        variant: 'destructive',
      });
      navigate('/sessions');
      return;
    }
    fetchSession();
  }, [id]);

  const goPrev = async () => {
    if (activeIdx > 0 && id) {
      try {
        if (boardRef.current) await boardRef.current.flushSnapshot();
        await sessionsService.changeStage(id, stages[activeIdx - 1].id);
      } catch (err) {
        console.error('Error changing stage:', err);
      }
    }
  };

  const goNext = async () => {
    if (activeIdx < stages.length - 1 && id) {
      try {
        if (boardRef.current) await boardRef.current.flushSnapshot();
        await sessionsService.changeStage(id, stages[activeIdx + 1].id);
      } catch (err) {
        console.error('Error changing stage:', err);
      }
    }
  };

  const handleCreateStage = async () => {
    if (!newStageTitle.trim()) {
      toast({
        title: 'Campo obligatorio',
        description: 'Por favor ingresa un título para la escena.',
        variant: 'destructive',
      });
      return;
    }

    if (id === 'demo') {
      const mockId = Math.random().toString();
      const newStage = {
        id: mockId,
        title: newStageTitle.trim(),
        type: newStageType,
        duration: Number(newStageDuration),
        completed: false,
      };
      const updatedStages = [...stages, newStage];
      useOrchestratorStore.getState().syncState({
        stages: updatedStages,
        activeStageId: activeStageId || mockId,
      });
      toast({
        title: 'Escena creada (Demo)',
        description: `Se agregó la escena "${newStageTitle}" localmente.`,
      });
      setIsAddOpen(false);
      setNewStageTitle('');
      setNewStageType('BOARD');
      setNewStageDuration('10');
      return;
    }

    // templateId may be empty if fetchSession hasn't resolved yet — re-fetch on the fly
    let resolvedTemplateId = templateId;
    if (!resolvedTemplateId && id) {
      try {
        const freshSession = await sessionsService.get(id);
        resolvedTemplateId = freshSession.template_id || '';
        if (resolvedTemplateId) setTemplateId(resolvedTemplateId);
      } catch (e) {
        console.error('Could not re-fetch session for templateId:', e);
      }
    }

    if (!resolvedTemplateId) {
      toast({
        title: 'Error de Plantilla',
        description: 'No se detectó una plantilla válida asociada a esta sesión. Intenta refrescar la página.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingStage(true);
    try {
      const payload = {
        title: newStageTitle.trim(),
        stage_type: newStageType,
        duration_estimated_minutes: Number(newStageDuration),
      };
      const created = await sessionsService.addStage(resolvedTemplateId, payload);
      toast({
        title: 'Escena creada',
        description: `Se guardó la escena "${newStageTitle}" con éxito.`,
      });
      await fetchSession();
      if (!activeStageId) {
        await sessionsService.changeStage(id!, created.id);
      }
      setIsAddOpen(false);
      setNewStageTitle('');
      setNewStageType('BOARD');
      setNewStageDuration('10');
    } catch (err) {
      console.error('Failed to create stage:', err);
      toast({
        title: 'Error al crear escena',
        description: 'No se pudo guardar la escena en el servidor.',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingStage(false);
    }
  };

  const handleAwardPoints = () => {
    if (!selectedParticipant || !points) return;
    sendMessage('gamification', 'POINTS_AWARDED', { participant_id: selectedParticipant, points: Number(points), action_label: 'Participación' });
  };


  const handleTimer = () => sendMessage('gamification', 'TIMER_STARTED', { duration_seconds: 60, label: 'Actividad' });
  const handleLaunchQuiz = () => {
    const activeQuestions = useQuizStore.getState().questions;
    if (activeQuestions.length === 0 || !activeQuestions[0].id || activeQuestions[0].id.startsWith('q_')) {
      toast({
        title: 'Sin preguntas guardadas',
        description: 'Debes agregar y autoguardar al menos una pregunta en el Quiz Builder antes de lanzarlo.',
        variant: 'destructive',
      });
      return;
    }
    sendMessage('gamification', 'QUIZ_LAUNCHED', { question_id: activeQuestions[0].id });
    toast({
      title: '¡Quiz lanzado!',
      description: 'La primera pregunta del cuestionario ha sido enviada a todos los estudiantes.',
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* ── TOPBAR ────────────────────────────────────── */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center justify-between px-4 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/sessions')} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Separator orientation="vertical" className="h-5" />
          <div className="w-6 h-6 rounded-md sidebar-gradient flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm truncate max-w-[200px]">{sessionInfo.title}</span>
          <div className="flex items-center gap-1 ml-2">
            <span className="text-xs font-mono bg-muted/20 px-2 py-0.5 rounded">Código: {sessionInfo.join_code || '---'}</span>
            <button onClick={() => {
              navigator.clipboard.writeText(sessionInfo.join_code ?? '');
              toast({ title: 'Código copiado', description: 'El código de la clase se ha copiado al portapapeles.', variant: 'default' });
            }} className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/20 hover:bg-primary/30">
              <Copy className="w-3 h-3 text-primary" />
            </button>
            <button onClick={() => {
              const link = `${window.location.origin}/session/${id}`;
              navigator.clipboard.writeText(link);
              toast({ title: 'Enlace copiado', description: 'El enlace de la clase se ha copiado al portapapeles.', variant: 'default' });
            }} className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/20 hover:bg-primary/30">
              <Link className="w-3 h-3 text-primary" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status */}
          <Badge variant="outline" className={cn(
            'text-xs gap-1.5',
            isConnected ? 'border-green-500/40 text-green-500' : 'border-destructive/40 text-destructive'
          )}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isReconnecting ? 'Reconectando...' : isConnected ? 'Conectado' : 'Sin conexión'}
          </Badge>

          {/* Live badge */}
          <Badge className="bg-red-500 text-white border-0 gap-1.5 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            EN VIVO
          </Badge>

          {/* Pause/Resume */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 text-xs"
            onClick={async () => {
              if (!id) return;
              try {
                if (sessionState === 'LIVE') {
                  await sessionsService.pause(id);
                  setSessionState('PAUSED');
                } else {
                  await sessionsService.resume(id);
                  setSessionState('LIVE');
                }
              } catch (err) {
                console.error("Error changing session state:", err);
              }
            }}
          >
            {sessionState === 'LIVE' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {sessionState === 'LIVE' ? 'Pausar' : 'Reanudar'}
          </Button>

          <Button
            variant="destructive"
            size="sm"
            className="h-8 gap-2 text-xs"
            onClick={async () => {
              if (!id) return;
              try {
                await sessionsService.end(id);
                navigate('/sessions');
              } catch (err) {
                console.error("Error ending session:", err);
              }
            }}
          >
            <Square className="w-3 h-3" />
            Finalizar
          </Button>
        </div>
      </header>

      {/* ── MAIN BODY ─────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR — Stage list (220px) */}
        <aside className="w-[220px] border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-3 border-b border-border flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={goPrev} disabled={activeIdx <= 0}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" className="flex-1 h-8 text-xs sidebar-gradient border-0 text-white" onClick={goNext} disabled={activeIdx >= stages.length - 1 || activeIdx === -1}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {stages.map((stage, idx) => {
                const Icon = STAGE_ICONS[stage.type] ?? Zap;
                const isActive = stage.id === activeStageId;
                return (
                  <motion.div
                    key={stage.id}
                    whileHover={{ x: 2 }}
                    className={cn(
                      'group relative p-2.5 rounded-lg cursor-pointer border transition-all flex items-center justify-between',
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:bg-muted'
                    )}
                    onClick={async () => {
                      if (id && !isActive) {
                        try {
                          if (boardRef.current) await boardRef.current.flushSnapshot();
                          await sessionsService.changeStage(id, stage.id);
                        } catch (err) {
                          console.error('Error switching stage:', err);
                        }
                      }
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                        isActive ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                      )}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-xs font-semibold truncate',
                          isActive ? 'text-primary' : 'text-foreground'
                        )}>
                          {idx + 1}. {stage.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">{stage.type} · {stage.duration} min</p>
                      </div>
                    </div>
                    {/* Delete stage button */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`¿Eliminar la escena "${stage.title}"?`)) {
                          try {
                            await sessionsService.deleteStage(templateId, stage.id);
                            const remaining = stages.filter(s => s.id !== stage.id);
                            if (isActive && remaining.length > 0) {
                              await sessionsService.changeStage(id!, remaining[0].id);
                            }
                            await fetchSession();
                          } catch (err) {
                            console.error('Failed to delete stage:', err);
                          }
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1 rounded transition-opacity shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-border">
            <Button
              onClick={() => setIsAddOpen(true)}
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs gap-1.5 hover:bg-primary/5 hover:text-primary hover:border-primary/30"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar Escena
            </Button>
          </div>
        </aside>

        {/* CENTER — Main canvas (flex-1) */}
        <main className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            {!activeStage ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 text-center p-6"
              >
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2">
                  <Zap className="w-8 h-8 text-zinc-600 animate-pulse" />
                </div>
                <h3 className="text-white text-lg font-semibold">Clase sin escenas</h3>
                <p className="text-zinc-500 text-sm max-w-sm">
                  Crea una escena (como una Pizarra) desde el panel izquierdo para comenzar a interactuar con tus estudiantes.
                </p>
                <Button 
                  onClick={() => setIsAddOpen(true)}
                  className="sidebar-gradient border-0 text-white text-xs h-9 px-4 mt-2"
                >
                  Crear Primera Escena
                </Button>
              </motion.div>
            ) : activeStage.type === 'BOARD' ? (
              <BoardWrapper ref={boardRef} key={activeStage.id} role="instructor" sendMessage={sendMessage} />
            ) : activeStage.type === 'QUIZ' || activeStage.type === 'GAME' ? (
              <div className="w-full h-full overflow-y-auto bg-background text-foreground p-4">
                <QuizBuilderPage sessionId={id} />
              </div>
            ) : (
              <motion.div
                key={activeStageId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <div className="w-20 h-20 rounded-2xl card-gradient-blue flex items-center justify-center">
                  {activeStage && (() => { const Icon = STAGE_ICONS[activeStage.type] ?? Zap; return <Icon className="w-10 h-10 text-white" />; })()}
                </div>
                <div>
                  <p className="text-white text-xl font-bold">{activeStage?.title}</p>
                  <p className="text-zinc-400 text-sm mt-1">
                    {activeStage?.type === 'PDF'
                      ? 'Visor de PDF sincronizado'
                      : 'Escena activa'}
                  </p>
                </div>
                <Badge className="bg-white/10 text-white border-white/20 text-xs">
                  Vista del estudiante
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reconnecting banner */}
          {isReconnecting && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur px-4 py-2 rounded-full border border-border text-sm text-muted-foreground flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Reconectando al servidor...
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR — Controls (280px) */}
        <aside className="w-[280px] border-l border-border bg-card flex flex-col shrink-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="p-2 border-b border-border shrink-0">
              <TabsList className="w-full h-8">
                <TabsTrigger value="clase" className="flex-1 text-xs">Clase</TabsTrigger>
                <TabsTrigger value="estudiantes" className="flex-1 text-xs">
                  Estudiantes
                  <Badge className="ml-1.5 h-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
                    {participants.filter(p => p.online).length}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* CLASE TAB */}
            <TabsContent value="clase" className="flex-1 overflow-y-auto m-0 p-3 space-y-4 scrollbar-thin">
              {/* Gamification */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Gamificación</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-16 flex-col gap-1 text-xs" onClick={handleSpinner}>
                    <Dices className="w-5 h-5 text-primary" />
                    Ruleta
                  </Button>
                  <Button variant="outline" className="h-16 flex-col gap-1 text-xs" onClick={handleTimer}>
                    <Timer className="w-5 h-5 text-accent" />
                    Timer
                  </Button>
                  <Button variant="outline" className="h-16 flex-col gap-1 text-xs col-span-2 hover:bg-primary/5 hover:text-primary" onClick={handleLaunchQuiz}>
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Lanzar Quiz
                  </Button>
                </div>
              </div>

                <RouletteWheel
                  open={isRouletteOpen}
                  onClose={() => setIsRouletteOpen(false)}
                  participants={participants.map(p => ({ id: p.id, name: p.name }))}
                  onResult={(winnerId) => {
                    // Send result to backend or handle locally
                    sendMessage('gamification', 'ROULETTE_RESULT', { participant_id: winnerId });
                  }}
                />
                <Separator />

              {/* Points */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Asignar Puntos</p>
                <div className="space-y-2">
                  <select
                    value={selectedParticipant}
                    onChange={e => setSelectedParticipant(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Seleccionar estudiante...</option>
                    {participants.filter(p => p.online).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1} max={100}
                      value={points}
                      onChange={e => setPoints(e.target.value)}
                      className="h-9 text-center font-bold"
                    />
                    <Button
                      size="sm"
                      className="h-9 card-gradient-orange border-0 text-white px-4 shrink-0 hover:opacity-90"
                      onClick={handleAwardPoints}
                      disabled={!selectedParticipant}
                    >
                      +Pts
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    {[5, 10, 25, 50].map(v => (
                      <Button key={v} variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setPoints(String(v))}>
                        +{v}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ESTUDIANTES TAB */}
            <TabsContent value="estudiantes" className="flex-1 m-0 overflow-y-auto scrollbar-thin">
              <div className="divide-y divide-border">
                {participants
                  .slice()
                  .sort((a, b) => b.points - a.points)
                  .map((p, idx) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-xs text-muted-foreground w-4 text-right font-mono">{idx + 1}</span>
                      <div className="relative shrink-0">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px] bg-primary text-primary-foreground font-bold">
                            {p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card', p.online ? 'bg-green-500' : 'bg-muted-foreground')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                      </div>
                      <span className="text-xs font-bold font-mono text-accent">{p.points}</span>
                    </div>
                  ))}
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* ── BOTTOM TOOLBAR ─────────────────────────────── */}
      <footer className="h-13 border-t border-border bg-card/80 backdrop-blur flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Herramientas:</span>
          {activeStage?.type === 'BOARD' && (
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              Puntero Láser
            </Button>
          )}
          {activeStage?.type === 'PDF' && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 text-xs w-8 p-0">‹</Button>
              <span className="text-xs font-mono text-muted-foreground">Pág 1/10</span>
              <Button variant="outline" size="sm" className="h-8 text-xs w-8 p-0">›</Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
            {/* Join class button */}
            <Button variant="outline" size="sm" className="h-8 text-xs gap-2" onClick={() => setIsJoinOpen(true)}>
              <UserPlus className="w-3.5 h-3.5" />
              Unirse
            </Button>
            {/* Join Class Dialog */}
            <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
              <DialogContent className="sm:max-w-[400px] bg-zinc-950 text-white border-zinc-800 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">Unirse a una clase</DialogTitle>
                </DialogHeader>
                <div className="p-4">
                  <Input placeholder="Ingresa el código de la clase" value={joinCode} onChange={e => setJoinCode(e.target.value)} className="mb-4" />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsJoinOpen(false)}>Cancelar</Button>
                    <Button onClick={async () => {
                      if (!joinCode.trim()) {
                        toast({ title: 'Código vacío', description: 'Por favor ingresa un código de clase.', variant: 'destructive' });
                        return;
                      }
                      try {
                        const session = await sessionsService.joinByCode(joinCode.trim());
                        toast({ title: 'Unido', description: `Te has unido a la clase ${session.title}.`, variant: 'default' });
                        navigate(`/session/${session.id}`);
                      } catch (err: any) {
                        console.error('Error joining class:', err);
                        let errorMsg = 'Código inválido o no autorizado.';
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
                        toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
                      } finally {
                        setIsJoinOpen(false);
                        setJoinCode('');
                      }
                    }}>Unirse</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Chat
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" />
            Recursos
          </Button>
          <Button size="sm" className="h-8 text-xs sidebar-gradient border-0 text-white gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {participants.filter(p => p.online).length} online
          </Button>
        </div>
      </footer>

      {/* ── MODAL AGREGAR ESCENA ───────────────────────── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[500px] bg-zinc-950 text-white border-zinc-800 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Agregar Nueva Escena
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Selecciona el tipo de escena para tu clase interactiva.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Título de la Escena
              </label>
              <Input
                placeholder="Ej. Pizarra de Dibujo Libre"
                value={newStageTitle}
                onChange={(e) => setNewStageTitle(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-white focus-visible:ring-primary focus-visible:border-primary placeholder:text-zinc-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Duración Estimada (minutos)
              </label>
              <Input
                type="number"
                min={1}
                max={120}
                value={newStageDuration}
                onChange={(e) => setNewStageDuration(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-white focus-visible:ring-primary focus-visible:border-primary w-24 font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-1">
                Funcionalidad / Tipo de Escena
              </label>
              <div className="grid grid-cols-2 gap-3">
                {/* BOARD (Pizarra) */}
                <div
                  onClick={() => setNewStageType('BOARD')}
                  className={cn(
                    'p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 flex flex-col gap-2 relative overflow-hidden',
                    newStageType === 'BOARD'
                      ? 'border-primary bg-primary/10 text-white'
                      : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/60'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                      newStageType === 'BOARD' ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-400'
                    )}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-white">Pizarra</span>
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-400">
                    Lienzo digital interactivo para dibujar y escribir en tiempo real.
                  </p>
                  <Badge className="absolute top-2 right-2 bg-green-500/20 text-green-400 hover:bg-green-500/20 border-0 text-[9px] px-1.5 py-0">
                    Listo
                  </Badge>
                </div>

                {/* PDF (Visor de PDF) - Disabled */}
                <div
                  className="p-3.5 rounded-xl border-2 border-zinc-900 bg-zinc-900/20 text-zinc-600 flex flex-col gap-2 relative cursor-not-allowed"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-zinc-950 flex items-center justify-center shrink-0 text-zinc-600">
                      <FolderOpen className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-zinc-500">Visor PDF</span>
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-600">
                    Presentaciones, diapositivas y documentos compartidos.
                  </p>
                  <Badge className="absolute top-2 right-2 bg-zinc-800 text-zinc-500 hover:bg-zinc-800 border-0 text-[9px] px-1.5 py-0">
                    Próximamente
                  </Badge>
                </div>

                {/* QUIZ (Quiz Evaluativo) */}
                <div
                  onClick={() => setNewStageType('QUIZ')}
                  className={cn(
                    'p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 flex flex-col gap-2 relative overflow-hidden',
                    newStageType === 'QUIZ'
                      ? 'border-primary bg-primary/10 text-white'
                      : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/60'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                      newStageType === 'QUIZ' ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-400'
                    )}>
                      <Trophy className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-white">Quiz</span>
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-400">
                    Encuestas y cuestionarios rápidos de opción múltiple.
                  </p>
                  <Badge className="absolute top-2 right-2 bg-green-500/20 text-green-400 hover:bg-green-500/20 border-0 text-[9px] px-1.5 py-0">
                    Listo
                  </Badge>
                </div>

                {/* BREAK (Pausa) - Disabled for now */}
                <div
                  className="p-3.5 rounded-xl border-2 border-zinc-900 bg-zinc-900/20 text-zinc-600 flex flex-col gap-2 relative cursor-not-allowed"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-zinc-950 flex items-center justify-center shrink-0 text-zinc-600">
                      <Timer className="w-4 h-4" />
                    </div>
                    <span className="font-semibold text-sm text-zinc-500">Pausa</span>
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-600">
                    Segmento de descanso cronometrado entre actividades.
                  </p>
                  <Badge className="absolute top-2 right-2 bg-zinc-800 text-zinc-500 hover:bg-zinc-800 border-0 text-[9px] px-1.5 py-0">
                    Próximamente
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsAddOpen(false)}
              className="border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateStage}
              disabled={isCreatingStage || !newStageTitle.trim()}
              className="sidebar-gradient border-0 text-white font-semibold"
            >
              {isCreatingStage ? 'Creando...' : 'Crear Escena'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
