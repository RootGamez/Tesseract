import apiClient from './apiClient';

export interface LoginCredentials { email: string; password: string; }

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: 'INSTRUCTOR' | 'STUDENT' | 'ADMIN';
  organization?: string;
  avatar_url?: string;
}

export interface RegisterPayload {
  email: string;
  display_name: string;
  password: string;
  password_confirm: string;
  role: 'INSTRUCTOR' | 'STUDENT';
}

export interface AuthTokens { access: string; refresh: string; user: AuthUser; }

export const authService = {
  async refreshAccessToken(): Promise<string | null> {
    const refreshToken = localStorage.getItem('tesseract_refresh_token');
    if (!refreshToken) return null;

    try {
      const { data } = await apiClient.post<{ access: string }>('/api/v1/auth/token/refresh/', { refresh: refreshToken });
      localStorage.setItem('tesseract_access_token', data.access);
      return data.access;
    } catch {
      localStorage.removeItem('tesseract_access_token');
      localStorage.removeItem('tesseract_refresh_token');
      return null;
    }
  },

  async register(payload: RegisterPayload): Promise<AuthTokens> {
    const { data } = await apiClient.post<{ user: AuthUser; tokens: { access: string; refresh: string } }>('/api/v1/auth/register/', payload);
    localStorage.setItem('tesseract_access_token', data.tokens.access);
    localStorage.setItem('tesseract_refresh_token', data.tokens.refresh);
    return {
      access: data.tokens.access,
      refresh: data.tokens.refresh,
      user: data.user,
    };
  },

  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>('/api/v1/auth/login/', credentials);
    localStorage.setItem('tesseract_access_token', data.access);
    localStorage.setItem('tesseract_refresh_token', data.refresh);
    return data;
  },

  async me(): Promise<AuthUser> {
    const { data } = await apiClient.get<AuthUser>('/api/v1/auth/me/');
    return data;
  },

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('tesseract_refresh_token');
    try { await apiClient.post('/api/v1/auth/logout/', { refresh: refreshToken }); } finally {
      localStorage.removeItem('tesseract_access_token');
      localStorage.removeItem('tesseract_refresh_token');
    }
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('tesseract_access_token');
  },
};
