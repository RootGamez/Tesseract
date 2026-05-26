import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, PencilLine, RefreshCw } from 'lucide-react';
import { Canvas, FabricImage } from 'fabric';
import throttle from 'lodash.throttle';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/lib/utils';
import { presentationsService, type PresentationSlide } from '../services/presentationsService';

interface CollaborativePresentationStageProps {
  sessionId: string;
  role: 'student' | 'instructor';
  sendMessage: (channel: 'sessions' | 'chat' | 'board' | 'presentations' | 'gamification', event: string, payload: any) => void;
}

export default function CollaborativePresentationStage({ sessionId, role, sendMessage }: CollaborativePresentationStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [canvasReady, setCanvasReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [presentationTitle, setPresentationTitle] = useState('Presentación');
  const [activeCanvasState, setActiveCanvasState] = useState<any>(null);

  const currentSlide = useMemo(() => slides.find((slide) => slide.index === currentSlideIndex) ?? slides[0], [slides, currentSlideIndex]);
  const canEdit = role === 'instructor';

  const syncCanvasState = useMemo(() => throttle((nextCanvas: Canvas, slideIndex: number) => {
    const canvasState = nextCanvas.toJSON();
    sendMessage('presentations', 'canvas.draw', {
      slide_index: slideIndex,
      canvas_state: canvasState,
    });
  }, 120), [sendMessage]);

  useEffect(() => () => syncCanvasState.cancel(), [syncCanvasState]);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);

    presentationsService.getSessionState(sessionId)
      .then((state) => {
        if (!alive) return;
        setSlides(state.slides || []);
        setCurrentSlideIndex(state.current_slide_index || 0);
        setPresentationTitle(state.title || 'Presentación');
        setActiveCanvasState(state.current_annotation?.canvas_state || state.active_canvas_state || null);
      })
      .catch((error) => {
        console.error('Failed to load presentation state', error);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [sessionId]);

  useEffect(() => {
    const canvas = canvasElRef.current;
    const container = stageRef.current;
    if (!canvas || !container) return;

    const fabricCanvas = new Canvas(canvas, {
      isDrawingMode: canEdit,
      selection: canEdit,
      preserveObjectStacking: true,
      backgroundColor: 'transparent',
    });

    if (fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.width = 3;
      fabricCanvas.freeDrawingBrush.color = '#f97316';
    }
    fabricCanvasRef.current = fabricCanvas;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      fabricCanvas.setDimensions({ width: rect.width, height: rect.height });
      fabricCanvas.renderAll();
    };

    resize();
    window.addEventListener('resize', resize);

    const handlePathCreated = () => {
      if (!canEdit || isApplyingRemoteRef.current) return;
      syncCanvasState(fabricCanvas, currentSlideIndex);
    };

    fabricCanvas.on('path:created', handlePathCreated);
    fabricCanvas.on('object:modified', handlePathCreated);
    fabricCanvas.on('mouse:up', handlePathCreated);

    if (activeCanvasState) {
      isApplyingRemoteRef.current = true;
      fabricCanvas.loadFromJSON(activeCanvasState, () => {
        fabricCanvas.renderAll();
        isApplyingRemoteRef.current = false;
      });
    }

    setCanvasReady(true);

    return () => {
      window.removeEventListener('resize', resize);
      fabricCanvas.off('path:created', handlePathCreated);
      fabricCanvas.off('object:modified', handlePathCreated);
      fabricCanvas.off('mouse:up', handlePathCreated);
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [canEdit, activeCanvasState, currentSlideIndex, syncCanvasState]);

  useEffect(() => {
    const handlePresentationState = (event: Event) => {
      const data = (event as CustomEvent<any>).detail;
      if (!data) return;

      setSlides(data.slides || []);
      setCurrentSlideIndex(data.current_slide_index || 0);
      setPresentationTitle(data.title || 'Presentación');

      const nextCanvasState = data.current_annotation?.canvas_state || data.active_canvas_state || null;
      setActiveCanvasState(nextCanvasState);
    };

    const handleSlideChange = (event: Event) => {
      const data = (event as CustomEvent<any>).detail;
      if (typeof data?.slide_index === 'number') {
        setCurrentSlideIndex(data.slide_index);
      }
    };

    const handleCanvasDraw = (event: Event) => {
      const data = (event as CustomEvent<any>).detail;
      const fabricCanvas = fabricCanvasRef.current;
      if (!fabricCanvas || !data?.canvas_state) return;

      if (data.slide_index !== undefined && data.slide_index !== currentSlideIndex) return;

      isApplyingRemoteRef.current = true;
      fabricCanvas.loadFromJSON(data.canvas_state, () => {
        fabricCanvas.renderAll();
        isApplyingRemoteRef.current = false;
      });
    };

    window.addEventListener('presentation-state', handlePresentationState);
    window.addEventListener('presentation-slide-change', handleSlideChange);
    window.addEventListener('presentation-canvas-draw', handleCanvasDraw);

    return () => {
      window.removeEventListener('presentation-state', handlePresentationState);
      window.removeEventListener('presentation-slide-change', handleSlideChange);
      window.removeEventListener('presentation-canvas-draw', handleCanvasDraw);
    };
  }, [currentSlideIndex]);

  useEffect(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = canEdit;
    fabricCanvas.selection = canEdit;
    if (fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.width = canEdit ? 3 : 0;
    }
  }, [canEdit]);

  useEffect(() => {
    const fabricCanvas = fabricCanvasRef.current;
    if (!fabricCanvas || !currentSlide) return;

    const slideUrl = currentSlide.image_key.startsWith('http')
      ? currentSlide.image_key
      : `${import.meta.env.VITE_MEDIA_URL || ''}/${currentSlide.image_key}`;

    let disposed = false;
    FabricImage.fromURL(slideUrl).then((image) => {
      if (disposed || !fabricCanvas) return;

      const width = fabricCanvas.getWidth() || 1;
      const height = fabricCanvas.getHeight() || 1;
      const scale = Math.min(width / (image.width || width), height / (image.height || height));

      image.scale(scale);
      fabricCanvas.backgroundImage = image as any;
      fabricCanvas.requestRenderAll();
    });

    return () => {
      disposed = true;
    };
  }, [currentSlide]);

  const changeSlide = (direction: -1 | 1) => {
    const nextIndex = Math.max(0, Math.min((slides.length - 1) || 0, currentSlideIndex + direction));
    setCurrentSlideIndex(nextIndex);
    sendMessage('presentations', 'slide.change', { slide_index: nextIndex });
  };

  return (
    <div ref={stageRef} className="w-full h-full relative overflow-hidden bg-zinc-950">
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <Badge className="bg-black/50 border-white/10 text-white backdrop-blur">
          <PencilLine className="w-3.5 h-3.5 mr-1" />
          {presentationTitle}
        </Badge>
        <Badge variant="outline" className="bg-black/30 border-white/10 text-white">
          Slide {currentSlideIndex + 1} / {Math.max(slides.length, 1)}
        </Badge>
      </div>

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => changeSlide(-1)} className="h-8 gap-1.5 bg-black/30 border-white/10 text-white hover:bg-white/10">
          <ChevronLeft className="w-4 h-4" />
          Prev
        </Button>
        <Button size="sm" variant="outline" onClick={() => changeSlide(1)} className="h-8 gap-1.5 bg-black/30 border-white/10 text-white hover:bg-white/10">
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => sendMessage('presentations', 'REQUEST_PRESENTATION_SYNC', {})} className="h-8 gap-1.5 bg-black/30 border-white/10 text-white hover:bg-white/10">
          <RefreshCw className="w-4 h-4" />
          Sync
        </Button>
      </div>

      <div className={cn('absolute inset-0 flex items-center justify-center', isLoading && 'opacity-60')}>
        <canvas ref={canvasElRef} className="absolute inset-0 h-full w-full" />
      </div>

      <AnimatePresence>
        {!canvasReady && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm z-30"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mx-auto animate-pulse" />
              <p className="text-white font-medium">Cargando presentación...</p>
              <p className="text-zinc-400 text-sm">{isLoading ? 'Sincronizando el estado inicial' : 'Preparando canvas colaborativo'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
