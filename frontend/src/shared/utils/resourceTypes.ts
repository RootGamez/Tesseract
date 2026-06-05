// Shared mapping between uploaded files and backend Resource types.
// Documents (Word, spreadsheets, text/markdown) are rendered to PDF on the
// backend and shown in the same viewer as native PDFs.

export type UploadResourceType = 'PDF' | 'PRESENTATION' | 'DOCUMENT';

// PDF-viewer stages render PDFs and documents converted to PDF.
export const DOCUMENT_STAGE_ACCEPT = '.pdf,.docx,.doc,.xlsx,.ods,.odt,.txt,.md';
// Presentation stages render slide decks from PowerPoint files.
export const PRESENTATION_STAGE_ACCEPT = '.ppt,.pptx';

/** Accept attribute for a stage's file input, scoped to what the stage can display. */
export function acceptForStageType(stageType: string): string {
  return stageType === 'PRESENTATION' ? PRESENTATION_STAGE_ACCEPT : DOCUMENT_STAGE_ACCEPT;
}

const PRESENTATION_EXTS = new Set(['ppt', 'pptx']);
const DOCUMENT_EXTS = new Set(['docx', 'doc', 'xlsx', 'ods', 'odt', 'txt', 'md']);

/** Map a filename to the backend resource_type based on its extension. */
export function resourceTypeForFile(fileName: string): UploadResourceType {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (PRESENTATION_EXTS.has(ext)) return 'PRESENTATION';
  if (DOCUMENT_EXTS.has(ext)) return 'DOCUMENT';
  return 'PDF';
}
