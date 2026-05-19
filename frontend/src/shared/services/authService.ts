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

export interface AuthTokens { access: string; refresh: string; user: AuthUser; }

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>('/api/auth/token/', credentials);
    localStorage.setItem('tesseract_access_token', data.access);
    localStorage.setItem('tesseract_refresh_token', data.refresh);
    return data;
  },

  async me(): Promise<AuthUser> {
    const { data } = await apiClient.get<AuthUser>('/api/auth/me/');
    return data;
  },

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('tesseract_refresh_token');
    try { await apiClient.post('/api/auth/logout/', { refresh: refreshToken }); } finally {
      localStorage.removeItem('tesseract_access_token');
      localStorage.removeItem('tesseract_refresh_token');
    }
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('tesseract_access_token');
  },
};
