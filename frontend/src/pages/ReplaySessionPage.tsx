import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen,
  Presentation, FileText, MonitorPlay, Video, Trophy, Gamepad2,
  MessageCircle, FolderOpen, Coffee, Sparkles, History, Inbox,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { sessionsService } from '@/shared/services/sessionsService';
import { useWebSocket } from '@/shared/hooks/useWebSocket';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';
import BoardWrapper from '@/features/board/components/BoardWrapper';
import PDFStage from '@/features/presentations/components/PDFStage';
import CollaborativePresentationStage from '@/features/presentations/components/CollaborativePresentationStage';
import VideoStage, { parseVideoSource } from '@/features/presentations/components/VideoStage';
import QuizReview from '@/features/quiz/components/QuizReview';
import SubmissionStage from '@/features/submissions/components/SubmissionStage';

interface ReplayStage {
  id: string;
  title: string;
  stage_type: string;
  order: number;
  config?: Record<string, any>;
}

const STAGE_META: Record<string, { label: string; icon: typeof Presentation }> = {
  BOARD: { label: 'Pizarra', icon: Presentation },
  PDF: { label: 'Documento', icon: FileText },
  PRESENTATION: { label: 'Presentación', icon: MonitorPlay },
  VIDEO: { label: 'Video', icon: Video },
  QUIZ: { label: 'Quiz', icon: Trophy },
  GAME: { label: 'Juego', icon: Gamepad2 },
  SUBMISSION: { label: 'Entregables', icon: Inbox },
  CHAT_FOCUS: { label: 'Chat', icon: MessageCircle },
  RESOURCE: { label: 'Recursos', icon: FolderOpen },
  BREAK: { label: 'Descanso', icon: Coffee },
};

function stageMeta(type: string) {
  return STAGE_META[type] ?? { label: type, icon: Sparkles };
}

/** Reads the configured video URL from a VIDEO stage config, if present. */
function videoUrl(config?: Record<string, any>): string {
  return config?.youtube_url || config?.url || config?.video_url || config?.src || '';
}

export default function ReplaySessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [title, setTitle] = useState('Repaso de clase');
  const [stages, setStages] = useState<ReplayStage[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Connect read-only: board/presentation content streams in via WS snapshots,
  // but in 'replay' mode the student — not the instructor — drives navigation.
  const { sendMessage } = useWebSocket(id ?? null, 'student', 'replay');

  const setActiveStageGlobal = useOrchestratorStore((s) => s.setActiveStage);

  // ── Load the session + its stages ─────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setIsLoading(true);
    sessionsService.get(id)
      .then((session) => {
        if (!alive) return;
        setTitle(session.title || 'Repaso de clase');
        const ordered = [...(session.stages ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setStages(ordered);
        if (ordered.length > 0) selectStage(ordered[0].id);
      })
      .catch((e) => {
        console.error('Failed to load session for replay', e);
        if (alive) setError('No pudimos cargar esta clase. Puede que ya no esté disponible.');
      })
      .finally(() => alive && setIsLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Select a stage and publish it to the shared store so the heavy stage
  // components (which read activeStageId) load the right content.
  const selectStage = (stageId: string) => {
    setActiveId(stageId);
    setActiveStageGlobal(stageId);
  };

  const activeIndex = useMemo(() => stages.findIndex((s) => s.id === activeId), [stages, activeId]);
  const activeStage = activeIndex >= 0 ? stages[activeIndex] : null;

  const go = (dir: -1 | 1) => {
    const next = activeIndex + dir;
    if (next >= 0 && next < stages.length) selectStage(stages[next].id);
  };

  // ── Render the active stage's content ─────────────────────────────────────────
  const renderStage = () => {
    if (!activeStage || !id) return null;
    switch (activeStage.stage_type) {
      case 'BOARD':
        return <BoardWrapper key={activeStage.id} role="student" sendMessage={sendMessage} />;
      case 'PDF':
        return <PDFStage key={activeStage.id} sessionId={id} role="student" activeStageId={activeStage.id} reviewMode />;
      case 'PRESENTATION':
        return <CollaborativePresentationStage key={activeStage.id} sessionId={id} role="student" sendMessage={sendMessage} />;
      case 'QUIZ':
      case 'GAME':
        return <QuizReview key={activeStage.id} sessionId={id} stageId={activeStage.id} />;
      case 'SUBMISSION':
        return <SubmissionStage key={activeStage.id} sessionId={id} stageId={activeStage.id} role="student" config={activeStage.config} reviewMode />;
      case 'VIDEO': {
        const url = videoUrl(activeStage.config);
        if (!parseVideoSource(url)) return <StagePlaceholder stage={activeStage} note="No se adjuntó ningún video a esta etapa." />;
        // reviewMode: controles libres, sin sincronización (repaso self-paced).
        return <VideoStage key={activeStage.id} url={url} role="student" stageId={activeStage.id} reviewMode />;
      }
      default:
        return <StagePlaceholder stage={activeStage} />;
    }
  };

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm">Cargando el repaso de la clase...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
          <History className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-foreground font-semibold">{error}</p>
          <Button variant="outline" onClick={() => navigate('/student-dashboard')}>Volver al inicio</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-3 sm:px-4 justify-between bg-card shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate('/student-dashboard')} title="Volver">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden lg:flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title={sidebarOpen ? 'Ocultar etapas' : 'Mostrar etapas'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary hidden sm:inline">Tesseract</span>
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                <History className="w-3 h-3" /> Repaso
              </span>
            </div>
            <p className="font-medium text-foreground text-sm truncate leading-tight">{title}</p>
          </div>
        </div>
        <span className="text-muted-foreground text-xs font-mono shrink-0 hidden sm:block">
          {stages.length > 0 ? `Etapa ${activeIndex + 1} / ${stages.length}` : 'Sin etapas'}
        </span>
      </header>

      {/* Mobile stage strip */}
      {stages.length > 0 && (
        <div className="lg:hidden flex gap-2 overflow-x-auto scrollbar-thin px-3 py-2 border-b border-border bg-card/60 shrink-0">
          {stages.map((s, i) => {
            const Meta = stageMeta(s.stage_type);
            const Icon = Meta.icon;
            return (
              <button
                key={s.id}
                onClick={() => selectStage(s.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors shrink-0',
                  s.id === activeId ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-muted',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{i + 1}. {s.title || Meta.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (desktop) */}
        <AnimatePresence initial={false}>
          {sidebarOpen && stages.length > 0 && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 264, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:flex border-r border-border bg-card flex-col shrink-0 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border shrink-0">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Etapas de la clase</h3>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
                {stages.map((s, i) => {
                  const Meta = stageMeta(s.stage_type);
                  const Icon = Meta.icon;
                  const active = s.id === activeId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => selectStage(s.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors group',
                        active ? 'bg-primary/10 border-primary/40' : 'border-transparent hover:bg-muted',
                      )}
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground',
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm font-medium truncate', active ? 'text-primary' : 'text-foreground')}>
                          {i + 1}. {s.title || Meta.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{Meta.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950 min-w-0">
          <div className="flex-1 overflow-hidden relative">
            {stages.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 p-8 bg-background">
                <History className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">Esta clase no tiene etapas para repasar.</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full"
                >
                  {renderStage()}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Bottom navigation */}
          {stages.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-card shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={activeIndex <= 0} onClick={() => go(-1)}>
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground font-medium truncate text-center min-w-0">
                {activeStage?.title || stageMeta(activeStage?.stage_type ?? '').label}
              </span>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={activeIndex >= stages.length - 1} onClick={() => go(1)}>
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StagePlaceholder({ stage, note }: { stage: ReplayStage; note?: string }) {
  const Meta = stageMeta(stage.stage_type);
  const Icon = Meta.icon;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 p-8 bg-background">
      <div className="w-20 h-20 rounded-3xl card-gradient-blue flex items-center justify-center shadow-xl">
        <Icon className="w-10 h-10 text-white" />
      </div>
      <div>
        <p className="text-foreground text-xl font-bold">{stage.title || Meta.label}</p>
        <p className="text-muted-foreground text-sm mt-1">{note ?? `Esta etapa de tipo "${Meta.label}" fue una actividad en vivo.`}</p>
      </div>
    </div>
  );
}
