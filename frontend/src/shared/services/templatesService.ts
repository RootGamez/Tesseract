import apiClient from './apiClient';

export interface TemplateStage {
  id?: string;
  title: string;
  stage_type: string;
  order?: number;
  duration_estimated_minutes: number;
  config?: Record<string, unknown>;
  initial_board_state?: Record<string, unknown>;
}

export interface ClassTemplateOwner {
  id: string;
  display_name?: string;
  email?: string;
}

export interface ClassTemplate {
  id: string;
  title: string;
  description: string;
  owner?: ClassTemplateOwner;
  is_public: boolean;
  estimated_duration_minutes: number;
  tags: string[];
  thumbnail?: string | null;
  stages: TemplateStage[];
  stage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplatePayload {
  title: string;
  description: string;
  is_public: boolean;
  estimated_duration_minutes: number;
  tags: string[];
  stages?: TemplateStagePayload[];
}

export interface TemplateStagePayload {
  title: string;
  stage_type: string;
  duration_estimated_minutes: number;
  config?: Record<string, unknown>;
  initial_board_state?: Record<string, unknown>;
}

const normalizeTemplatesResponse = (data: any): ClassTemplate[] => {
  if (Array.isArray(data)) return data;
  return data?.results || [];
};

export const templatesService = {
  async list(): Promise<ClassTemplate[]> {
    const { data } = await apiClient.get('/api/v1/sessions/templates/');
    return normalizeTemplatesResponse(data);
  },
  async get(id: string): Promise<ClassTemplate> {
    const { data } = await apiClient.get<ClassTemplate>(`/api/v1/sessions/templates/${id}/`);
    return data;
  },
  async create(payload: TemplatePayload): Promise<ClassTemplate> {
    const { data } = await apiClient.post<ClassTemplate>('/api/v1/sessions/templates/', payload);
    return data;
  },
  async update(id: string, payload: TemplatePayload): Promise<ClassTemplate> {
    const { data } = await apiClient.patch<ClassTemplate>(`/api/v1/sessions/templates/${id}/`, payload);
    return data;
  },
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/v1/sessions/templates/${id}/`);
  },
  async clone(id: string): Promise<ClassTemplate> {
    const { data } = await apiClient.post<ClassTemplate>(`/api/v1/sessions/templates/${id}/clone/`);
    return data;
  },
  async addStage(templateId: string, payload: TemplateStagePayload): Promise<TemplateStage> {
    const { data } = await apiClient.post<TemplateStage>(`/api/v1/sessions/templates/${templateId}/stages/add/`, payload);
    return data;
  },
  async deleteStage(templateId: string, stageId: string): Promise<void> {
    await apiClient.post(`/api/v1/sessions/templates/${templateId}/stages/delete/`, { stage_id: stageId });
  },
  async updateStage(templateId: string, stageId: string, payload: Partial<TemplateStagePayload>): Promise<TemplateStage> {
    const { data } = await apiClient.post<TemplateStage>(`/api/v1/sessions/templates/${templateId}/stages/update/`, {
      stage_id: stageId,
      ...payload
    });
    return data;
  },
  async reorderStages(templateId: string, stageIds: string[]): Promise<void> {
    await apiClient.patch(`/api/v1/sessions/templates/${templateId}/stages/reorder/`, { stage_ids: stageIds });
  },
  // Persist an uploaded file (PDF/PPTX/document) as a reusable asset on a template stage.
  async uploadFile(templateId: string, stageId: string, file: File, resourceType: 'PDF' | 'PRESENTATION' | 'DOCUMENT'): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('resource_type', resourceType);
    formData.append('stage_id', stageId);
    const { data } = await apiClient.post(`/api/v1/resources/templates/${templateId}/upload/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  async listFiles(templateId: string): Promise<any[]> {
    const { data } = await apiClient.get(`/api/v1/resources/templates/${templateId}/files/`);
    return Array.isArray(data) ? data : (data?.results || []);
  },
};
