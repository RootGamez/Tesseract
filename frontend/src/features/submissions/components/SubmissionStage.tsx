import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox, Download, Projector, StopCircle, Loader2, CheckCircle2,
  FileText, Presentation as PresentationIcon, FileSpreadsheet, Save, Trash2, Send,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useToast } from '@/shared/hooks/use-toast';
import { FileUploadField } from '@/shared/components/ui/file-upload';
import { formatFileSize, fileCategory } from '@/shared/utils/resourceTypes';
import { useOrchestratorStore } from '@/features/orchestrator/store/orchestratorStore';
import { sessionsService } from '@/shared/services/sessionsService';
import apiClient from '@/shared/services/apiClient';
import PDFStage from '@/features/presentations/components/PDFStage';
import {
  submissionsService, toPresented,
  type Submission, type PresentedSubmission,
} from '../services/submissionsService';

type SendMessage = (channel: any, event: string, payload: any) => void;

interface SubmissionStageProps {
  sessionId: string;
  stageId: string;
  role: 'student' | 'instructor';
  /** Stage config: { description, presented_submission }. */
  config?: Record<string, any> | null;
  sendMessage?: SendMessage;
  /** Replay of a finished class: read-only, no uploads, no broadcasts. */
  reviewMode?: boolean;
}

const CATEGORY_ICON = {
  pdf: FileText,
  presentation: PresentationIcon,
  document: FileText,
  sheet: FileSpreadsheet,
} as const;

const isRealSession = (id: string) => !!id && id !== 'demo' && id !== 'undefined';

/** Fetch a resource blob (with auth) and open it in a new tab. */
async function openResource(resourceId: string, documentVariant = false) {
  const url = `/api/v1/resources/${resourceId}/download/${documentVariant ? '?variant=pdf' : ''}`;
  const { data } = await apiClient.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(data as Blob);
  window.open(objectUrl, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export default function SubmissionStage({
  sessionId, stageId, role, config, sendMessage, reviewMode = false,
}: SubmissionStageProps) {
  return role === 'instructor' && !reviewMode
    ? <InstructorView sessionId={sessionId} stageId={stageId} config={config} sendMessage={sendMessage} />
    : <StudentView sessionId={sessionId} stageId={stageId} config={config} reviewMode={reviewMode} />;
}

// ── Projected document (shared by both roles) ──────────────────────────────────

function ProjectedDocument({
  sessionId, presented, role, sendMessage, onStop,
}: {
  sessionId: string;
  presented: PresentedSubmission;
  role: 'student' | 'instructor';
  sendMessage?: SendMessage;
  onStop?: () => void;
}) {
  const [page, setPage] = useState(1);

  // Instructor drives the page; students follow via the global pdf-page-changed event.
  const broadcastPage = (p: number) => {
    setPage(p);
    sendMessage?.('presentations', 'PDF_PAGE_CHANGED', { page: p, stage_id: '' });
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Projector className="w-4 h-4 text-primary shrink-0" />
          <span className="text-white text-sm font-medium truncate">{presented.name}</span>
          <span className="text-zinc-500 text-xs truncate hidden sm:inline">· {presented.student_name}</span>
        </div>
        {role === 'instructor' && onStop && (
          <Button
            variant="outline" size="sm"
            className="h-7 text-xs gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10 shrink-0"
            onClick={onStop}
          >
            <StopCircle className="w-3.5 h-3.5" /> Dejar de presentar
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <PDFStage
          key={presented.resource_id}
          sessionId={sessionId}
          role={role}
          resourceId={presented.resource_id}
          documentVariant={presented.document_variant}
          currentPage={page}
          onPageChange={role === 'instructor' ? broadcastPage : undefined}
        />
      </div>
    </div>
  );
}

// ── Instructor view ────────────────────────────────────────────────────────────

function InstructorView({
  sessionId, stageId, config, sendMessage,
}: {
  sessionId: string;
  stageId: string;
  config?: Record<string, any> | null;
  sendMessage?: SendMessage;
}) {
  const { toast } = useToast();
  const [description, setDescription] = useState<string>(config?.description ?? '');
  const [savedDescription, setSavedDescription] = useState<string>(config?.description ?? '');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [presented, setPresented] = useState<PresentedSubmission | null>(config?.presented_submission ?? null);
  const [isSaving, setIsSaving] = useState(false);

  const presentedRef = useRef(presented);
  presentedRef.current = presented;

  // ── Persist { description, presented_submission } into the stage config ──────
  const persistConfig = useCallback(async (next: { description: string; presented_submission: PresentedSubmission | null }) => {
    const store = useOrchestratorStore.getState();
    store.syncState({ stages: store.stages.map(s => (s.id === stageId ? { ...s, config: next } : s)) });
    if (!isRealSession(sessionId)) return;
    try {
      await sessionsService.updateStage(sessionId, stageId, { config: next });
    } catch (e) {
      console.error('No se pudo guardar la escena de entregables', e);
    }
  }, [sessionId, stageId]);

  // ── Poll the submission list so new uploads appear live ─────────────────────
  useEffect(() => {
    if (!isRealSession(sessionId)) return;
    let alive = true;
    const load = () => submissionsService.list(sessionId, stageId)
      .then(data => { if (alive) setSubmissions(data); })
      .catch(() => { /* transient */ });
    load();
    const id = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [sessionId, stageId]);

  const handleSaveDescription = async () => {
    setIsSaving(true);
    await persistConfig({ description, presented_submission: presentedRef.current });
    setSavedDescription(description);
    setIsSaving(false);
    toast({ title: 'Descripción guardada', description: 'Los alumnos verán las instrucciones del entregable.' });
  };

  const handlePresent = async (sub: Submission) => {
    const next = toPresented(sub);
    setPresented(next);
    await persistConfig({ description: savedDescription, presented_submission: next });
    sendMessage?.('presentations', 'SUBMISSION_PRESENT', { stage_id: stageId, presented: next });
  };

  const handleStopPresenting = async () => {
    setPresented(null);
    await persistConfig({ description: savedDescription, presented_submission: null });
    sendMessage?.('presentations', 'SUBMISSION_PRESENT', { stage_id: stageId, presented: null });
  };

  if (presented) {
    return (
      <ProjectedDocument
        sessionId={sessionId}
        presented={presented}
        role="instructor"
        sendMessage={sendMessage}
        onStop={handleStopPresenting}
      />
    );
  }

  const dirty = description !== savedDescription;

  return (
    <div className="w-full h-full flex flex-col bg-background overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">

          {/* Description editor */}
          <section className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-foreground font-bold text-sm">Descripción del entregable</h2>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Explica de qué trata y qué deben subir los alumnos.
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 sidebar-gradient border-0 text-white shrink-0"
                onClick={handleSaveDescription}
                disabled={isSaving || !dirty}
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar
              </Button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Suban el informe final en PDF o Word (máx. 50MB). Debe incluir portada, desarrollo y conclusiones."
              rows={5}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 resize-y focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </section>

          {/* Submissions inbox */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Inbox className="w-4 h-4 text-primary" />
              <h2 className="text-foreground font-bold text-sm">Entregas recibidas</h2>
              <span className="text-[11px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                {submissions.length}
              </span>
            </div>

            {submissions.length === 0 ? (
              <div className="border-2 border-dashed border-border rounded-2xl p-10 text-center">
                <Inbox className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Aún no hay entregas. Aparecerán aquí en cuanto los alumnos suban sus archivos.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {submissions.map((sub) => {
                  const Icon = CATEGORY_ICON[fileCategory(sub.name)];
                  const ready = sub.is_converted;
                  return (
                    <li
                      key={sub.id}
                      className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="shrink-0 grid place-items-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{sub.uploaded_by_name ?? 'Alumno'}</p>
                        <p className="text-xs text-muted-foreground truncate" title={sub.name}>
                          {sub.name} · <span className="tabular-nums">{formatFileSize(sub.size_bytes)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost" size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Descargar"
                          onClick={() => openResource(sub.id).catch(() => toast({ title: 'No se pudo abrir el archivo', variant: 'destructive' }))}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        {ready ? (
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5 sidebar-gradient border-0 text-white"
                            onClick={() => handlePresent(sub)}
                          >
                            <Projector className="w-3.5 h-3.5" /> Presentar
                          </Button>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando…
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Student view ───────────────────────────────────────────────────────────────

function StudentView({
  sessionId, stageId, config, reviewMode,
}: {
  sessionId: string;
  stageId: string;
  config?: Record<string, any> | null;
  reviewMode: boolean;
}) {
  const { toast } = useToast();
  const description: string = config?.description ?? '';
  const [presented, setPresented] = useState<PresentedSubmission | null>(config?.presented_submission ?? null);
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Live projection control from the instructor.
  useEffect(() => {
    if (reviewMode) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.stage_id && d.stage_id !== stageId) return;
      setPresented(d?.presented ?? null);
    };
    window.addEventListener('submission-present', handler);
    return () => window.removeEventListener('submission-present', handler);
  }, [stageId, reviewMode]);

  // Load the student's own current submission.
  useEffect(() => {
    if (!isRealSession(sessionId)) return;
    let alive = true;
    submissionsService.list(sessionId, stageId)
      .then(data => { if (alive) setMySubmission(data[0] ?? null); })
      .catch(() => { /* none yet */ });
    return () => { alive = false; };
  }, [sessionId, stageId]);

  const handleUpload = async (selected: File) => {
    setFile(selected);
    setUploadProgress(0);
    try {
      const created = await submissionsService.upload(sessionId, stageId, selected, setUploadProgress);
      setMySubmission(created);
      setFile(null);
      toast({ title: '¡Entregado!', description: 'Tu archivo se subió correctamente.' });
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo subir el archivo. Inténtalo de nuevo.';
      toast({ title: 'Error al subir', description: message, variant: 'destructive' });
      setFile(null);
    } finally {
      setUploadProgress(null);
    }
  };

  const handleRemove = async () => {
    if (!mySubmission) return;
    try {
      await submissionsService.remove(sessionId, mySubmission.id);
      setMySubmission(null);
      toast({ title: 'Entrega eliminada', description: 'Puedes subir un nuevo archivo.' });
    } catch {
      toast({ title: 'No se pudo eliminar', variant: 'destructive' });
    }
  };

  // While the instructor projects a submission, students follow that document.
  if (presented) {
    return <ProjectedDocument sessionId={sessionId} presented={presented} role="student" />;
  }

  const Icon = mySubmission ? CATEGORY_ICON[fileCategory(mySubmission.name)] : FileText;

  return (
    <div className="w-full h-full flex flex-col bg-background overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">

          {/* Instructions */}
          <section className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Send className="w-4 h-4 text-primary" />
              <h2 className="text-foreground font-bold text-sm">Entregable</h2>
            </div>
            {description.trim() ? (
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">El profesor aún no ha añadido instrucciones.</p>
            )}
          </section>

          {/* Upload / current submission */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tu entrega</h3>

            <AnimatePresence mode="wait">
              {mySubmission && uploadProgress === null ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border border-green-500/30 bg-green-500/5 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 grid place-items-center w-10 h-10 rounded-lg bg-green-500/10 text-green-500">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate" title={mySubmission.name}>
                        {mySubmission.name}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Entregado · {formatFileSize(mySubmission.size_bytes)}
                      </p>
                    </div>
                    {!reviewMode && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                        title="Quitar entrega"
                        onClick={handleRemove}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {!reviewMode && (
                    <p className="text-[11px] text-muted-foreground mt-3">
                      ¿Necesitas corregir? Quita tu archivo y sube uno nuevo.
                    </p>
                  )}
                </motion.div>
              ) : reviewMode ? (
                <motion.p key="review" className="text-sm text-muted-foreground">
                  No subiste ningún archivo en esta clase.
                </motion.p>
              ) : (
                <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <FileUploadField
                    file={file}
                    onSelect={handleUpload}
                    onClear={() => setFile(null)}
                    progress={uploadProgress}
                    title="Subir tu entregable"
                    description="PDF, PowerPoint, Word, Excel y texto · hasta 50 MB"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </div>
  );
}
