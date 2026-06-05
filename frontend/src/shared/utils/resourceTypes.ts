// Shared mapping between uploaded files and backend Resource types.
// Documents (Word, spreadsheets, text/markdown) are rendered to PDF on the
// backend and shown in the same viewer as native PDFs.

export type UploadResourceType = 'PDF' | 'PRESENTATION' | 'DOCUMENT';

const PRESENTATION_EXTS = new Set(['ppt', 'pptx']);
const DOCUMENT_EXTS = new Set(['docx', 'doc', 'xlsx', 'ods', 'odt', 'txt', 'md']);

// Everything the stage uploader accepts (the file decides the stage type).
export const ALL_UPLOAD_ACCEPT = '.pdf,.ppt,.pptx,.docx,.doc,.xlsx,.ods,.odt,.txt,.md';
// Human-readable summary for upload UI copy.
export const ACCEPTED_TYPES_LABEL = 'PDF, PowerPoint, Word, Excel y texto';
// Hard cap mirrored from the backend (RF-RES-01).
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const ALL_EXTS = new Set<string>(['pdf', ...PRESENTATION_EXTS, ...DOCUMENT_EXTS]);

function extOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

/** True when the file's extension is one we can ingest. */
export function isAcceptedFile(fileName: string): boolean {
  return ALL_EXTS.has(extOf(fileName));
}

/** Map a filename to the backend resource_type based on its extension. */
export function resourceTypeForFile(fileName: string): UploadResourceType {
  const ext = extOf(fileName);
  if (ext === 'pdf') return 'PDF';
  if (PRESENTATION_EXTS.has(ext)) return 'PRESENTATION';
  if (DOCUMENT_EXTS.has(ext)) return 'DOCUMENT';
  return 'PDF';
}

/** Coarse category used to pick an icon/label in the UI. */
export function fileCategory(fileName: string): 'pdf' | 'presentation' | 'document' | 'sheet' {
  const ext = extOf(fileName);
  if (ext === 'pdf') return 'pdf';
  if (PRESENTATION_EXTS.has(ext)) return 'presentation';
  if (ext === 'xlsx' || ext === 'ods') return 'sheet';
  return 'document';
}

/** Human-friendly file size, e.g. "2.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
