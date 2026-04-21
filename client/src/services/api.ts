import axios from 'axios';

const normalizeApiBaseUrl = (url?: string) => (url || '').replace(/\/$/, '');
const envApiBaseUrl = normalizeApiBaseUrl((import.meta as any).env?.VITE_API_URL);
const apiBaseURL = envApiBaseUrl || '/api';

const getApiOrigin = () => {
  if (!apiBaseURL || apiBaseURL.startsWith('/')) {
    return window.location.origin;
  }
  try {
    return new URL(apiBaseURL).origin;
  } catch {
    return window.location.origin;
  }
};

export const resolveUploadsUrlFromFilePath = (sourcePath: string) => {
  const uploadsMatch = sourcePath.match(/[\\/]uploads[\\/](.+)$/);
  if (!uploadsMatch) return null;

  const normalizedRelativePath = uploadsMatch[1].replace(/\\/g, '/');
  return `${getApiOrigin()}/uploads/${normalizedRelativePath}`;
};

const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const refreshUrl = apiBaseURL.startsWith('http')
            ? `${apiBaseURL}/auth/refresh`
            : '/api/auth/refresh';
          const { data } = await axios.post(refreshUrl, { refreshToken });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
