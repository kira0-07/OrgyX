import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://orgyx-backend.onrender.com";

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip refresh for auth endpoints to avoid infinite loops
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/');

    // Trigger refresh on ANY 401 (not just TOKEN_EXPIRED code)
    // as long as we haven't already retried and it's not an auth endpoint
    if (error.response?.status === 401 &&
        !originalRequest._retry &&
        !isAuthEndpoint) {

      originalRequest._retry = true;

      try {
        const refreshResponse = await axios.post(
          `${API_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );

        if (refreshResponse.data.success) {
          const { accessToken, user } = refreshResponse.data;
          localStorage.setItem('accessToken', accessToken);
          if (user) localStorage.setItem('user', JSON.stringify(user));

          // Update default header for all future requests
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh token itself expired — force logout
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;