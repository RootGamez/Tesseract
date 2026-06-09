import apiClient from '@/shared/services/apiClient';
import { resourceTypeForFile } from '@/shared/utils/resourceTypes';

/** A student's uploaded deliverable (backed by the Resource model). */
export interface Submission {
  id: string;
  name: string;
  resource_type: 'PDF' | 'DOCUMENT' | 'PRESENTATION' | 'IMAGE' | 'ZIP' | 'CODE' | 'OTHER';
  size_bytes: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  /** True once an office/PPT file has been rendered to PDF (always true for PDFs). */
  is_converted: boolean;
  created_at: string;
}

/** Minimal payload broadcast/persisted to drive the projected-submission view. */
export interface PresentedSubmission {
  resource_id: string;
  /** Fetch the PDF rendered from an office/PPT file (false for native PDFs). */
  document_variant: boolean;
  name: string;
  student_name: string;
}

/** Build the projection payload for a submission (PDFs project as-is). */
export function toPresented(sub: Submission): PresentedSubmission {
  return {
    resource_id: sub.id,
    document_variant: sub.resource_type !== 'PDF',
    name: sub.name,
    student_name: sub.uploaded_by_name ?? 'Alumno',
  };
}

export const submissionsService = {
  async list(sessionId: string, stageId: string): Promise<Submission[]> {
    const { data } = await apiClient.get<Submission[]>(
      `/api/v1/resources/sessions/${sessionId}/stages/${stageId}/submissions/`,
    );
    return Array.isArray(data) ? data : [];
  },

  async upload(
    sessionId: string,
    stageId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<Submission> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('resource_type', resourceTypeForFile(file.name));
    const { data } = await apiClient.post<Submission>(
      `/api/v1/resources/sessions/${sessionId}/stages/${stageId}/submissions/`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      },
    );
    return data;
  },

  async remove(sessionId: string, resourceId: string): Promise<void> {
    await apiClient.delete(`/api/v1/resources/sessions/${sessionId}/submissions/${resourceId}/`);
  },
};
