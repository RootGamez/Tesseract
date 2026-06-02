import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import apiClient from '@/shared/services/apiClient';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface PDFStageProps {
  sessionId: string;
  role: 'student' | 'instructor';
  activeStageId?: string;
  /** Instructor-controlled current page (passed from parent for instructor role) */
  currentPage?: number;
  /** Called when instructor navigates to a new page */
  onPageChange?: (page: number) => void;
}

export default function PDFStage({ sessionId, role, activeStageId, currentPage: controlledPage, onPageChange }: PDFStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // For instructor: local page state driven by controlledPage prop
  // For student: teacherPage = what teacher is showing; userPage = what student is viewing
  const [teacherPage, setTeacherPage] = useState(1);
  const [userPage, setUserPage] = useState(1);

  const localPage = role === 'instructor' ? (controlledPage ?? 1) : userPage;
  const isOutOfSync = role === 'student' && userPage !== teacherPage;

  // ── Load PDF ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);
    setPageCount(0);
    pdfRef.current = null;

    apiClient.get(`/api/v1/resources/sessions/${sessionId}/files/`)
      .then(res => {
        if (!alive) return;
        const resources = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        let match = resources.find((r: any) => r.resource_type === 'PDF' && String(r.stage) === String(activeStageId));
        if (!match) {
          match = resources.filter((r: any) => r.resource_type === 'PDF' && r.presigned_url).slice(-1)[0];
        }
        if (match?.id) {
          return apiClient.get(`/api/v1/resources/${match.id}/download/`, { responseType: 'blob' })
            .then(downloadRes => {
              if (!alive) return;
              const blob = downloadRes.data as Blob;
              setPdfUrl(URL.createObjectURL(blob));
            });
        }
        setErrorMessage('No se encontró un PDF para esta escena.');
      })
      .catch(() => { if (alive) setErrorMessage('No se pudo cargar el PDF.'); })
      .finally(() => { if (alive) setIsLoading(false); });

    return () => { alive = false; };
  }, [sessionId, activeStageId]);

  // ── Init PDF document ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;

    pdfjsLib.getDocument({ url: pdfUrl }).promise.then(pdf => {
      if (cancelled) return;
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      setTeacherPage(1);
      setUserPage(1);
    }).catch(() => {
      if (!cancelled) setErrorMessage('No se pudo renderizar el PDF.');
    });

    return () => {
      cancelled = true;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // ── Render page ─────────────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || pageNum < 1 || pageNum > pdf.numPages) return;

    // Cancel any in-progress render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setIsRendering(true);
    try {
      const page = await pdf.getPage(pageNum);
      const container = canvas.parentElement;
      const containerWidth = container?.clientWidth || 800;
      const pagePadding = 48;
      const targetWidth = Math.max(containerWidth - pagePadding, 320);

      const dpr = window.devicePixelRatio || 1;
      const viewport1 = page.getViewport({ scale: 1 });
      const scale = (targetWidth / viewport1.width) * dpr;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      const context = canvas.getContext('2d');
      if (!context) return;

      const renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        setErrorMessage('Error al renderizar la página.');
      }
    } finally {
      setIsRendering(false);
    }
  }, []);

  useEffect(() => {
    if (pageCount > 0) {
      void renderPage(localPage);
    }
  }, [localPage, pageCount, renderPage]);

  // ── Listen for teacher page changes (student only) ──────────────────────────
  useEffect(() => {
    if (role !== 'student') return;
    const handler = (e: Event) => {
      const { page } = (e as CustomEvent<{ page: number; stage_id: string }>).detail;
      if (page) {
        setTeacherPage(page);
        setUserPage(page); // auto-follow teacher by default
      }
    };
    window.addEventListener('pdf-page-changed', handler);
    return () => window.removeEventListener('pdf-page-changed', handler);
  }, [role]);

  // ── Page navigation ─────────────────────────────────────────────────────────
  const goToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(page, pageCount));
    if (role === 'instructor') {
      onPageChange?.(clamped);
    } else {
      setUserPage(clamped);
    }
  };

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white bg-zinc-950">
        Cargando PDF...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white bg-zinc-950">
        {errorMessage}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* ── Header: page indicator ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
        <span className="text-zinc-400 text-xs">
          {role === 'instructor' ? 'Controlando vista' : 'Vista del documento'}
        </span>
        <span className="text-zinc-300 text-sm font-mono">
          {pageCount > 0 ? `Página ${localPage} / ${pageCount}` : 'Cargando...'}
        </span>
      </div>

      {/* ── Canvas area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto flex items-start justify-center px-4 py-6 relative">
        {/* Out-of-sync banner for students */}
        <AnimatePresence>
          {isOutOfSync && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-20"
            >
              <button
                onClick={() => setUserPage(teacherPage)}
                className="flex items-center gap-2 bg-primary/90 hover:bg-primary text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg backdrop-blur transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Ir a página del profesor ({teacherPage})
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        <div
          style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', padding: 12, maxWidth: '100%' }}
        >
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        </div>
      </div>

      {/* ── Navigation controls ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 py-3 border-t border-white/10 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={localPage <= 1}
          onClick={() => goToPage(localPage - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-zinc-400 text-xs font-mono min-w-[80px] text-center">
          {localPage} / {pageCount || '—'}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={localPage >= pageCount}
          onClick={() => goToPage(localPage + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
