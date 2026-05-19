import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('tesseract_access_token');
    if (token && config.headers) config.headers['Authorization'] = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    const isLoginOrRefresh = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/token/refresh');
    if (error.response?.status === 401 && !originalRequest?._retry && !isLoginOrRefresh) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('tesseract_refresh_token');
        const { data } = await axios.post(`${BASE_URL}/api/v1/auth/token/refresh/`, { refresh: refreshToken });
        localStorage.setItem('tesseract_access_token', data.access);
        if (originalRequest.headers) {
          (originalRequest.headers as Record<string, string>)['Authorization'] = `Bearer ${data.access}`;
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
