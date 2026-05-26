import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import apiClient from '@/shared/services/apiClient';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface PDFStageProps {
  sessionId: string;
  role: 'student' | 'instructor';
  activeStageId?: string;
}

export default function PDFStage({ sessionId, activeStageId }: PDFStageProps) {
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setErrorMessage(null);
    setPageCount(0);
    apiClient.get(`/api/v1/resources/sessions/${sessionId}/files/`)
      .then(res => {
        if (!alive) return;
        const resources = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        // Try to find a PDF resource attached to this stage
        let match = resources.find((r: any) => r.resource_type === 'PDF' && String(r.stage) === String(activeStageId));
        // Fallback: pick the most recent uploaded PDF for the session
        if (!match) {
          match = resources.filter((r: any) => r.resource_type === 'PDF' && r.presigned_url).slice(-1)[0];
        }
        if (match?.id) {
          return apiClient.get(`/api/v1/resources/${match.id}/download/`, { responseType: 'blob' })
            .then((downloadRes) => {
              if (!alive) return;
              const blob = downloadRes.data as Blob;
              const nextUrl = URL.createObjectURL(blob);
              setPdfUrl(nextUrl);
            });
        }

        setErrorMessage('No se encontró un PDF para esta escena.');
      })
      .catch(() => {
        if (alive) setErrorMessage('No se pudo cargar el PDF.');
      })
      .finally(() => { if (alive) setIsLoading(false); });

    return () => { alive = false; };
  }, [sessionId, activeStageId]);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      if (!pdfUrl || !pagesContainerRef.current) return;

      pagesContainerRef.current.innerHTML = '';

      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);

        const containerWidth = pagesContainerRef.current.clientWidth || 800;
        const pagePadding = 32;
        const targetWidth = Math.max(containerWidth - pagePadding, 320);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const viewport1 = page.getViewport({ scale: 1 });
          const scale = targetWidth / viewport1.width;
          const viewport = page.getViewport({ scale });

          const wrapper = document.createElement('div');
          wrapper.style.width = '100%';
          wrapper.style.display = 'flex';
          wrapper.style.justifyContent = 'center';
          wrapper.style.marginBottom = '24px';

          const pageFrame = document.createElement('div');
          pageFrame.style.background = '#111';
          pageFrame.style.border = '1px solid rgba(255,255,255,0.08)';
          pageFrame.style.borderRadius = '16px';
          pageFrame.style.boxShadow = '0 12px 40px rgba(0,0,0,0.35)';
          pageFrame.style.padding = '12px';
          pageFrame.style.maxWidth = '100%';

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = 'block';
          canvas.style.width = '100%';
          canvas.style.height = 'auto';

          pageFrame.appendChild(canvas);
          wrapper.appendChild(pageFrame);
          pagesContainerRef.current.appendChild(wrapper);

          await page.render({ canvasContext: context, canvas, viewport }).promise;
        }
      } catch (error) {
        console.error('PDF render error', error);
        if (!cancelled) setErrorMessage('No se pudo renderizar el PDF.');
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">Cargando PDF...</div>
    );
  }

  if (errorMessage) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">{errorMessage}</div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-zinc-950 px-4 py-6">
      <div className="max-w-5xl mx-auto mb-4 text-zinc-300 text-sm flex items-center justify-between">
        <span>Vista por páginas</span>
        <span>{pageCount ? `${pageCount} páginas` : 'Cargando...'}</span>
      </div>
      <div ref={pagesContainerRef} className="w-full" />
    </div>
  );
}
