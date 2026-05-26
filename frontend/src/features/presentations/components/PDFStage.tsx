import { useEffect, useState } from 'react';
import apiClient from '@/shared/services/apiClient';

interface PDFStageProps {
  sessionId: string;
  role: 'student' | 'instructor';
  activeStageId?: string;
}

export default function PDFStage({ sessionId, activeStageId }: PDFStageProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
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
        if (match && match.presigned_url) setPdfUrl(match.presigned_url);
      })
      .catch(() => {})
      .finally(() => { if (alive) setIsLoading(false); });

    return () => { alive = false; };
  }, [sessionId, activeStageId]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">Cargando PDF...</div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">No se encontró archivo PDF para esta escena.</div>
    );
  }

  return (
    <div className="w-full h-full">
      <iframe src={pdfUrl} title="PDF viewer" className="w-full h-full" style={{ border: '0' }} />
    </div>
  );
}
