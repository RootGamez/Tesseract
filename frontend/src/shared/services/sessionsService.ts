import apiClient from './apiClient';

export interface LiveSession {
  id: string;
  title: string;
  state: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED';
  join_code: string;
  instructor: string;
  participant_count: number;
  created_at: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  ai_summary?: string;
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
  async start(id: string): Promise<LiveSession> {
    const { data } = await apiClient.post<LiveSession>(`/api/v1/sessions/live/${id}/transition/`, { action: 'start' });
    return data;
  },
  async end(id: string): Promise<LiveSession> {
    const { data } = await apiClient.post<LiveSession>(`/api/v1/sessions/live/${id}/transition/`, { action: 'end' });
    return data;
  },
  async joinByCode(code: string): Promise<LiveSession> {
    const { data } = await apiClient.post<{ session: LiveSession }>('/api/v1/sessions/join/', { code });
    return data.session;
  },
};
