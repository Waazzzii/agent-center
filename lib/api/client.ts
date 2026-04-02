/**
 * API Client
 * Axios instance pointing at wazzi-backend (auth, organizations, etc.)
 * with automatic token refresh and 401 retry interceptors.
 */

import axios, { type AxiosError } from 'axios';
import { refreshAccessToken } from '../auth/oauth';

function clearAuthAndRedirect(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('auth-storage');
  sessionStorage.clear();
  if (typeof window !== 'undefined') {
    window.location.replace('/login');
  }
}

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

// Attach bearer token to every request
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 — attempt token refresh then retry
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (!isRefreshing) {
        isRefreshing = true;
        originalRequest._retry = true;

        try {
          const refreshToken = localStorage.getItem('refresh_token');
          if (!refreshToken) {
            isRefreshing = false;
            clearAuthAndRedirect();
            return Promise.reject(new Error('No refresh token available'));
          }

          const { accessToken, refreshToken: newRefreshToken } = await refreshAccessToken(refreshToken);

          localStorage.setItem('access_token', accessToken);
          if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken);

          // Sync auth store without importing it here (avoids circular deps)
          // TokenRefreshProvider handles the full store update on its own cycle.
          // We just update localStorage so subsequent requests pick up the new token.

          isRefreshing = false;
          refreshQueue.forEach((cb) => cb(accessToken));
          refreshQueue = [];

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch {
          isRefreshing = false;
          refreshQueue = [];
          clearAuthAndRedirect();
          return Promise.reject(new Error('Session expired. Please login again.'));
        }
      }

      return new Promise((resolve) => {
        refreshQueue.push((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(originalRequest));
        });
      });
    }

    // 403 — permission denied; let callers handle it (useRequirePermission renders NoPermissionContent)
    if (error.response?.status === 403) return Promise.reject(error);

    return Promise.reject(error);
  }
);

export default apiClient;
