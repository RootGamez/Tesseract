import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import apiClient from '@/shared/services/apiClient';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface PDFStageProps {
  sessionId: string;
  role: 'student' | 'instructor';
  activeStageId?: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.15;

export default function PDFStage({ sessionId, role, activeStageId, currentPage: controlledPage, onPageChange }: PDFStageProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfRef        = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Zoom/pan live in refs so wheel/drag don't trigger React re-renders
  const zoomRef        = useRef(1);
  const panRef         = useRef({ x: 0, y: 0 });
  const isDraggingRef  = useRef(false);
  const lastMouseRef   = useRef({ x: 0, y: 0 });

  const [pdfUrl,      setPdfUrl]      = useState<string | null>(null);
  const [pageCount,   setPageCount]   = useState(0);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage,setErrorMessage]= useState<string | null>(null);
  const [zoomDisplay, setZoomDisplay] = useState(100); // percentage shown in UI

  const [teacherPage, setTeacherPage] = useState(1);
  const [userPage,    setUserPage]    = useState(1);

  const localPage   = role === 'instructor' ? (controlledPage ?? 1) : userPage;
  const isOutOfSync = role === 'student' && userPage !== teacherPage;

  // ── Transform helpers ────────────────────────────────────────────────────────
  const applyTransform = useCallback(() => {
    if (!transformRef.current) return;
    const { x, y } = panRef.current;
    const z = zoomRef.current;
    transformRef.current.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  }, []);

  const centerCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // canvas CSS size + wrapper padding (12px each side = 24px)
    const canvasW = parseFloat(canvas.style.width)  || canvas.clientWidth;
    const canvasH = parseFloat(canvas.style.height) || canvas.clientHeight;
    const wrapperExtra = 24;
    panRef.current = {
      x: Math.max(16, (cw - canvasW - wrapperExtra) / 2),
      y: Math.max(16, (ch - canvasH - wrapperExtra) / 2),
    };
    zoomRef.current = 1;
    applyTransform();
    setZoomDisplay(100);
  }, [applyTransform]);

  const resetView = useCallback(() => centerCanvas(), [centerCanvas]);

  // ── Zoom buttons (centered on viewport center) ────────────────────────────────
  const handleZoomButton = useCallback((dir: 'in' | 'out') => {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth  / 2;
    const cy = el.clientHeight / 2;
    const factor = dir === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
    const oldZ  = zoomRef.current;
    const newZ  = Math.max(MIN_ZOOM, Math.min(oldZ * factor, MAX_ZOOM));
    const ratio = newZ / oldZ;
    panRef.current = {
      x: cx - (cx - panRef.current.x) * ratio,
      y: cy - (cy - panRef.current.y) * ratio,
    };
    zoomRef.current = newZ;
    applyTransform();
    setZoomDisplay(Math.round(newZ * 100));
  }, [applyTransform]);

  // ── Load PDF ─────────────────────────────────────────────────────────────────
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
        if (!match) match = resources.filter((r: any) => r.resource_type === 'PDF' && r.presigned_url).slice(-1)[0];
        if (match?.id) {
          return apiClient.get(`/api/v1/resources/${match.id}/download/`, { responseType: 'blob' })
            .then(dl => { if (alive) setPdfUrl(URL.createObjectURL(dl.data as Blob)); });
        }
        setErrorMessage('No se encontró un PDF para esta escena.');
      })
      .catch(() => { if (alive) setErrorMessage('No se pudo cargar el PDF.'); })
      .finally(() => { if (alive) setIsLoading(false); });

    return () => { alive = false; };
  }, [sessionId, activeStageId]);

  // ── Init PDF document ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    pdfjsLib.getDocument({ url: pdfUrl }).promise.then(pdf => {
      if (cancelled) return;
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      setTeacherPage(1);
      setUserPage(1);
    }).catch(() => { if (!cancelled) setErrorMessage('No se pudo renderizar el PDF.'); });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // ── Render page ──────────────────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number, keepView = false) => {
    const pdf    = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || pageNum < 1 || pageNum > pdf.numPages) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setIsRendering(true);
    try {
      const page = await pdf.getPage(pageNum);
      const containerWidth = containerRef.current?.clientWidth || 800;
      const pagePadding    = 32;
      const targetWidth    = Math.max(containerWidth - pagePadding, 320);

      const dpr       = window.devicePixelRatio || 1;
      const viewport1 = page.getViewport({ scale: 1 });
      const scale     = (targetWidth / viewport1.width) * dpr;
      const viewport  = page.getViewport({ scale });

      canvas.width        = viewport.width;
      canvas.height       = viewport.height;
      canvas.style.width  = `${viewport.width  / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      const context = canvas.getContext('2d');
      if (!context) return;

      const renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = renderTask;
      await renderTask.promise;

      if (!keepView) centerCanvas();
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') setErrorMessage('Error al renderizar la página.');
    } finally {
      setIsRendering(false);
    }
  }, [centerCanvas]);

  useEffect(() => {
    if (pageCount > 0) void renderPage(localPage, false);
  }, [localPage, pageCount, renderPage]);

  // Re-render on container resize (keep zoom/pan position)
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (pageCount > 0) void renderPage(localPage, true);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [localPage, pageCount, renderPage]);

  // ── Mouse wheel zoom ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect   = el.getBoundingClientRect();
      const mx     = e.clientX - rect.left;
      const my     = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const oldZ   = zoomRef.current;
      const newZ   = Math.max(MIN_ZOOM, Math.min(oldZ * factor, MAX_ZOOM));
      const ratio  = newZ / oldZ;
      panRef.current = {
        x: mx - (mx - panRef.current.x) * ratio,
        y: my - (my - panRef.current.y) * ratio,
      };
      zoomRef.current = newZ;
      applyTransform();
      setZoomDisplay(Math.round(newZ * 100));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyTransform]);

  // ── Mouse drag to pan ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDraggingRef.current  = true;
      lastMouseRef.current   = { x: e.clientX, y: e.clientY };
      el.style.cursor        = 'grabbing';
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      applyTransform();
    };
    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      el.style.cursor = 'grab';
    };

    el.style.cursor = 'grab';
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [applyTransform]);

  // ── Touch: pinch zoom + single-finger pan ────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let lastDist = 0;
    let lastMid  = { x: 0, y: 0 };
    let lastTouch = { x: 0, y: 0 };

    const dist = (a: Touch, b: Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const mid  = (a: Touch, b: Touch, r: DOMRect) => ({
      x: (a.clientX + b.clientX) / 2 - r.left,
      y: (a.clientY + b.clientY) / 2 - r.top,
    });

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastDist  = dist(e.touches[0], e.touches[1]);
        lastMid   = mid(e.touches[0], e.touches[1], el.getBoundingClientRect());
      } else if (e.touches.length === 1) {
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const d    = dist(e.touches[0], e.touches[1]);
        const m    = mid(e.touches[0], e.touches[1], el.getBoundingClientRect());
        const factor = d / lastDist;
        const oldZ   = zoomRef.current;
        const newZ   = Math.max(MIN_ZOOM, Math.min(oldZ * factor, MAX_ZOOM));
        const ratio  = newZ / oldZ;
        const dx = m.x - lastMid.x;
        const dy = m.y - lastMid.y;
        panRef.current = {
          x: m.x - (m.x - panRef.current.x) * ratio + dx,
          y: m.y - (m.y - panRef.current.y) * ratio + dy,
        };
        zoomRef.current = newZ;
        applyTransform();
        setZoomDisplay(Math.round(newZ * 100));
        lastDist = d;
        lastMid  = m;
      } else if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouch.x;
        const dy = e.touches[0].clientY - lastTouch.y;
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
        applyTransform();
      }
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
    };
  }, [applyTransform]);

  // ── Double-click to reset view ───────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('dblclick', resetView);
    return () => el.removeEventListener('dblclick', resetView);
  }, [resetView]);

  // ── Teacher page sync (student) ──────────────────────────────────────────────
  useEffect(() => {
    if (role !== 'student') return;
    const handler = (e: Event) => {
      const { page } = (e as CustomEvent<{ page: number; stage_id: string }>).detail;
      if (page) { setTeacherPage(page); setUserPage(page); }
    };
    window.addEventListener('pdf-page-changed', handler);
    return () => window.removeEventListener('pdf-page-changed', handler);
  }, [role]);

  // ── Page navigation ──────────────────────────────────────────────────────────
  const goToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(page, pageCount));
    if (role === 'instructor') onPageChange?.(clamped);
    else setUserPage(clamped);
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
        <span className="text-zinc-400 text-xs">
          {role === 'instructor' ? 'Controlando vista' : 'Vista del documento'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
            onClick={() => handleZoomButton('out')}
            disabled={zoomDisplay <= Math.round(MIN_ZOOM * 100)}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <button
            onClick={resetView}
            className="text-zinc-300 text-xs font-mono w-14 text-center hover:text-white transition-colors tabular-nums"
            title="Restablecer vista"
          >
            {zoomDisplay}%
          </button>
          <Button
            variant="ghost" size="sm"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
            onClick={() => handleZoomButton('in')}
            disabled={zoomDisplay >= Math.round(MAX_ZOOM * 100)}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <div className="w-px h-4 bg-white/10 mx-2" />
          <span className="text-zinc-300 text-sm font-mono tabular-nums">
            {pageCount > 0 ? `${localPage} / ${pageCount}` : '— / —'}
          </span>
        </div>
      </div>

      {/* ── Canvas area — always in DOM so containerRef is valid for event listeners ── */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative select-none">

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-white z-30 bg-zinc-950">
            Cargando PDF...
          </div>
        )}

        {/* Error overlay */}
        {!isLoading && errorMessage && (
          <div className="absolute inset-0 flex items-center justify-center text-white z-30 bg-zinc-950">
            {errorMessage}
          </div>
        )}

        {/* Out-of-sync banner */}
        <AnimatePresence>
          {isOutOfSync && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
            >
              <button
                onClick={() => { setUserPage(teacherPage); resetView(); }}
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

        {/* Transform layer — zoom + pan applied here */}
        <div
          ref={transformRef}
          style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0' }}
        >
          <div style={{
            background: '#111',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            padding: 12,
          }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>
        </div>

        {/* Usage hint */}
        {!isLoading && !errorMessage && (
          <div className="absolute bottom-2 right-3 text-zinc-600 text-[10px] pointer-events-none select-none leading-relaxed text-right">
            Rueda: zoom · Arrastrar: mover · Doble clic: restablecer
          </div>
        )}
      </div>

      {/* ── Navigation controls ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 py-3 border-t border-white/10 shrink-0">
        <Button
          variant="outline" size="sm" className="h-8 w-8 p-0"
          disabled={localPage <= 1}
          onClick={() => goToPage(localPage - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-zinc-400 text-xs font-mono min-w-[80px] text-center tabular-nums">
          {localPage} / {pageCount || '—'}
        </span>
        <Button
          variant="outline" size="sm" className="h-8 w-8 p-0"
          disabled={localPage >= pageCount}
          onClick={() => goToPage(localPage + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

    </div>
  );
}
