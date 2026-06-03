import apiClient from './apiClient';

export interface LiveSession {
  id: string;
  title: string;
  state: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED';
  join_code: string;
  instructor: string | { id: string; display_name: string };
  participant_count: number;
  created_at: string;
  started_at?: string;
  ended_at?: string;
  scheduled_at?: string;
  duration_seconds?: number;
  ai_summary?: string;
  template_id?: string;
  stages?: any[];
  current_stage?: any;
  template?: { id: string; name: string };
}

export interface CreateSessionPayload { title: string; template_id?: string; }

export const sessionsService = {
  async list(): Promise<LiveSession[]> {
    const { data } = await apiClient.get<any>('/api/v1/sessions/live/');
    return Array.isArray(data) ? data : (data?.results || []);
  },
  async get(id: string): Promise<LiveSession> {
    const { data } = await apiClient.get<LiveSession>(`/api/v1/sessions/live/${id}/`);
    return data;
  },
  async create(payload: CreateSessionPayload): Promise<LiveSession> {
    const { data } = await apiClient.post<LiveSession>('/api/v1/sessions/live/', payload);
    return data;
  },
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/v1/sessions/live/${id}/`);
  },
  async start(id: string): Promise<LiveSession> {
    const { data } = await apiClient.post<LiveSession>(`/api/v1/sessions/live/${id}/transition/`, { action: 'start' });
    return data;
  },
  async end(id: string): Promise<LiveSession> {
    const { data } = await apiClient.post<LiveSession>(`/api/v1/sessions/live/${id}/transition/`, { action: 'end' });
    return data;
  },
  async pause(id: string): Promise<LiveSession> {
    const { data } = await apiClient.post<LiveSession>(`/api/v1/sessions/live/${id}/transition/`, { action: 'pause' });
    return data;
  },
  async resume(id: string): Promise<LiveSession> {
    const { data } = await apiClient.post<LiveSession>(`/api/v1/sessions/live/${id}/transition/`, { action: 'resume' });
    return data;
  },
  async changeStage(sessionId: string, stageId: string, boardSnapshot?: any): Promise<any> {
    const { data } = await apiClient.post(`/api/v1/sessions/live/${sessionId}/change-stage/`, {
      stage_id: stageId,
      board_snapshot: boardSnapshot,
    });
    return data;
  },
  async joinByCode(code: string): Promise<LiveSession> {
    // Backend expects POST with field `join_code` (uppercase)
    const payload = { join_code: code.trim().toUpperCase() };
    const { data } = await apiClient.post<{ session: LiveSession }>('/api/v1/sessions/join/', payload);
    return data.session;
  },
  async getParticipants(sessionId: string): Promise<any[]> {
    const { data } = await apiClient.get<any[]>(`/api/v1/sessions/live/${sessionId}/participants/`);
    return data;
  },
  // Stage management operates on the session's OWN stages (copied from the
  // template at creation), so a live class can be edited without touching the
  // original template — and classes created without a template work too.
  async addStage(
    sessionId: string,
    payload: { title: string; stage_type: string; duration_estimated_minutes: number; config?: Record<string, unknown> }
  ): Promise<any> {
    const { data } = await apiClient.post(`/api/v1/sessions/live/${sessionId}/stages/add/`, payload);
    return data;
  },
  async updateStage(
    sessionId: string,
    stageId: string,
    payload: Partial<{ title: string; duration_estimated_minutes: number; config: Record<string, unknown>; initial_board_state: Record<string, unknown> }>
  ): Promise<any> {
    const { data } = await apiClient.post(`/api/v1/sessions/live/${sessionId}/stages/update/`, {
      stage_id: stageId,
      ...payload,
    });
    return data;
  },
  async deleteStage(sessionId: string, stageId: string): Promise<any> {
    const { data } = await apiClient.post(`/api/v1/sessions/live/${sessionId}/stages/delete/`, { stage_id: stageId });
    return data;
  },
  async reorderStages(sessionId: string, stageIds: string[]): Promise<any> {
    const { data } = await apiClient.patch(`/api/v1/sessions/live/${sessionId}/stages/reorder/`, { stage_ids: stageIds });
    return data;
  },
};
