import apiClient from '@/shared/services/apiClient';

export interface PresentationSlide {
  id: string;
  index: number;
  image_key: string;
  image_url?: string;
  thumbnail_key?: string;
  mime_type: string;
  width: number;
  height: number;
  render_metadata?: Record<string, unknown>;
}

export interface PresentationAnnotation {
  id: string | null;
  revision: number;
  canvas_state: any;
}

export interface PresentationStateResponse {
  presentation_id: string;
  title: string;
  status: string;
  current_slide_index: number;
  active_canvas_state: any;
  slides: PresentationSlide[];
  current_annotation: PresentationAnnotation;
}

export const presentationsService = {
  async getSessionState(sessionId: string): Promise<PresentationStateResponse> {
    const { data } = await apiClient.get<PresentationStateResponse>(`/api/v1/presentations/sessions/${sessionId}/annotations/`);
    return data;
  },
};
