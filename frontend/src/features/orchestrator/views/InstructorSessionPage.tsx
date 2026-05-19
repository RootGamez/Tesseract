import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Zap, Users, MessageCircle, FolderOpen,
  Timer, Dices, Trophy, Wifi, WifiOff, Square, Play, Pause
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
import { cn } from '@/shared/lib/utils';
import BoardWrapper from '@/features/board/components/BoardWrapper';

const STAGE_ICONS: Record<string, React.ElementType> = {
  BOARD: Zap,
  PDF: FolderOpen,
  QUIZ: Trophy,
  GAME: Dices,
  BREAK: Timer,
};

export default function InstructorSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { stages, activeStageId, participants, sessionInfo } = useOrchestratorStore();
  const { isConnected, isReconnecting, sendMessage } = useWebSocket(id ?? null, 'instructor');
  const [activeTab, setActiveTab] = useState('clase');
  const [points, setPoints] = useState('10');
  const [selectedParticipant, setSelectedParticipant] = useState('');
  const [sessionState, setSessionState] = useState<'LIVE' | 'PAUSED'>('LIVE');

  const activeStage = stages.find(s => s.id === activeStageId);
  const activeIdx = stages.findIndex(s => s.id === activeStageId);

  const goPrev = async () => {
    if (activeIdx > 0 && id) {
      try {
        await sessionsService.changeStage(id, stages[activeIdx - 1].id);
      } catch (err) {
        console.error('Error changing stage:', err);
      }
    }
  };

  const goNext = async () => {
    if (activeIdx < stages.length - 1 && id) {
      try {
        await sessionsService.changeStage(id, stages[activeIdx + 1].id);
      } catch (err) {
        console.error('Error changing stage:', err);
      }
    }
  };

  const handleAwardPoints = () => {
    if (!selectedParticipant || !points) return;
    sendMessage('gamification', 'POINTS_AWARDED', { participant_id: selectedParticipant, points: Number(points), action_label: 'Participación' });
  };

  const handleSpinner = () => sendMessage('gamification', 'SPINNER_RESULT', { excluded_ids: [] });
  const handleTimer = () => sendMessage('gamification', 'TIMER_STARTED', { duration_seconds: 60, label: 'Actividad' });

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
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={goPrev} disabled={activeIdx === 0}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" className="flex-1 h-8 text-xs sidebar-gradient border-0 text-white" onClick={goNext} disabled={activeIdx >= stages.length - 1}>
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
                    onClick={async () => {
                      if (id) {
                        try {
                          await sessionsService.changeStage(id, stage.id);
                        } catch (err) {
                          console.error('Error switching stage:', err);
                        }
                      }
                    }}
                    className={cn(
                      'p-2.5 rounded-lg cursor-pointer border transition-all',
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:bg-muted'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', isActive ? 'card-gradient-blue' : 'bg-muted')}>
                        <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-white' : 'text-muted-foreground')} />
                      </div>
                      <p className={cn('text-xs font-medium truncate flex-1', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                        {idx + 1}. {stage.title}
                      </p>
                      {stage.completed && <span className="text-green-500 text-[10px]">✓</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-8">{stage.type} · {stage.duration}m</p>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        {/* CENTER — Main canvas (flex-1) */}
        <main className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            {activeStage?.type === 'BOARD' ? (
              <BoardWrapper role="instructor" sendMessage={sendMessage} />
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
                      : activeStage?.type === 'QUIZ'
                      ? 'Quiz en progreso'
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
                  <Button variant="outline" className="h-16 flex-col gap-1 text-xs col-span-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Lanzar Quiz
                  </Button>
                </div>
              </div>

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
    </div>
  );
}
