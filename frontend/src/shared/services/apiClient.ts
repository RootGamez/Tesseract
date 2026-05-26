import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

/** Seconds remaining until JWT expires. Negative = already expired. */
function jwtSecondsUntilExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp - Math.floor(Date.now() / 1000);
  } catch {
    return -1;
  }
}

let _refreshPromise: Promise<string> | null = null;

/** Silently refreshes the access token. Concurrent callers share the same Promise. */
async function silentRefresh(): Promise<string> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const refresh = localStorage.getItem('tesseract_refresh_token');
    if (!refresh) throw new Error('No refresh token');

    const { data } = await axios.post(
      `${BASE_URL}/api/v1/auth/token/refresh/`,
      { refresh },
      { headers: { 'Content-Type': 'application/json' } }
    );
    localStorage.setItem('tesseract_access_token', data.access);
    if (data.refresh) localStorage.setItem('tesseract_refresh_token', data.refresh);
    return data.access as string;
  })().finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

// ── Request interceptor: proactively refresh if token expires within 30 s ─────
apiClient.interceptors.request.use(
  async (config) => {
    const isRefreshCall = config.url?.includes('/auth/token/refresh') || config.url?.includes('/auth/login');
    if (isRefreshCall) return config;

    let token = localStorage.getItem('tesseract_access_token');

    if (token && jwtSecondsUntilExpiry(token) <= 30) {
      try {
        token = await silentRefresh();
      } catch {
        localStorage.removeItem('tesseract_access_token');
        localStorage.removeItem('tesseract_refresh_token');
        window.location.href = '/login';
        return Promise.reject(new Error('Session expired'));
      }
    }

    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: reactive fallback for unexpected 401 ────────────────
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    const isLoginOrRefresh =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/token/refresh');

    if (error.response?.status === 401 && !originalRequest?._retry && !isLoginOrRefresh) {
      originalRequest._retry = true;
      try {
        const newToken = await silentRefresh();
        if (originalRequest.headers) {
          (originalRequest.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest);
      } catch {
        localStorage.removeItem('tesseract_access_token');
        localStorage.removeItem('tesseract_refresh_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
