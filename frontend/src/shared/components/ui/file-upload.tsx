import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileText, Presentation, FileSpreadsheet, AlertCircle, X, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  ALL_UPLOAD_ACCEPT,
  ACCEPTED_TYPES_LABEL,
  MAX_UPLOAD_BYTES,
  isAcceptedFile,
  fileCategory,
  formatFileSize,
} from '@/shared/utils/resourceTypes';

interface FileUploadFieldProps {
  file: File | null;
  onSelect: (file: File) => void;
  onClear: () => void;
  /** Accept filter for the native dialog. Defaults to every supported type. */
  accept?: string;
  /** 0–100 while uploading; null/undefined when idle. */
  progress?: number | null;
  disabled?: boolean;
  title?: string;
  description?: string;
  className?: string;
}

const CATEGORY_ICON = {
  pdf: FileText,
  presentation: Presentation,
  document: FileText,
  sheet: FileSpreadsheet,
} as const;

export function FileUploadField({
  file,
  onSelect,
  onClear,
  accept = ALL_UPLOAD_ACCEPT,
  progress = null,
  disabled = false,
  title = 'Subir presentación',
  description,
  className,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUploading = progress !== null && progress !== undefined;
  const helperText = description ?? `${ACCEPTED_TYPES_LABEL} · hasta ${formatFileSize(MAX_UPLOAD_BYTES)}`;

  const validateAndSelect = useCallback((candidate: File | undefined | null) => {
    if (!candidate) return;
    const ext = candidate.name.split('.').pop()?.toLowerCase() ?? '';
    if (!isAcceptedFile(candidate.name)) {
      setError(`No aceptamos archivos «.${ext || '?'}». Formatos permitidos: ${ACCEPTED_TYPES_LABEL}.`);
      return;
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setError(`El archivo pesa ${formatFileSize(candidate.size)} y supera el límite de ${formatFileSize(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    setError(null);
    onSelect(candidate);
  }, [onSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;
    validateAndSelect(e.dataTransfer.files?.[0]);
  }, [disabled, isUploading, validateAndSelect]);

  const openPicker = () => {
    if (disabled || isUploading) return;
    inputRef.current?.click();
  };

  // ── Selected-file card ──────────────────────────────────────────────────────
  if (file && !error) {
    const Icon = CATEGORY_ICON[fileCategory(file.name)];
    return (
      <div className={cn('rounded-xl border border-border bg-card/60 p-3 sm:p-4', className)}>
        <div className="flex items-center gap-3">
          <div className="shrink-0 grid place-items-center w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-primary/10 text-primary">
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground" title={file.name}>{file.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{formatFileSize(file.size)}</p>
          </div>
          {isUploading ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
          ) : (
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              aria-label="Quitar archivo"
              className="shrink-0 grid place-items-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isUploading && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, progress!))}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
              <span className="flex items-center gap-1">
                {progress! >= 100 ? (
                  <><CheckCircle2 className="w-3 h-3 text-green-500" /> Procesando…</>
                ) : (
                  'Subiendo…'
                )}
              </span>
              <span>{Math.round(progress!)}%</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Dropzone ────────────────────────────────────────────────────────────────
  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={handleDrop}
        className={cn(
          'group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 sm:py-8 text-center cursor-pointer transition-colors outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary/40',
          isDragging ? 'border-primary bg-primary/10' : 'border-border bg-card/40 hover:border-primary/50 hover:bg-primary/5',
          (disabled) && 'opacity-60 pointer-events-none',
          error && 'border-destructive/60',
        )}
      >
        <div className={cn(
          'grid place-items-center w-11 h-11 rounded-xl transition-colors',
          isDragging ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground group-hover:text-primary',
        )}>
          <UploadCloud className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            {title}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="text-primary font-medium">Haz clic para subir</span> o arrastra el archivo aquí
          </p>
          <p className="text-[11px] text-muted-foreground/80">{helperText}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => { validateAndSelect(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export default FileUploadField;
