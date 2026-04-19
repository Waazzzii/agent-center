/**
 * API Client
 *
 * Axios instance pointing at the in-app BFF catchall (/api/backend/*),
 * which server-side reads the httpOnly session cookie and forwards to
 * wazzi-backend with Authorization: Bearer.
 *
 * Token refresh is handled by `TokenRefreshProvider`. On a 401 here we
 * simply reject — the caller (or a redirect) decides.
 */

import axios, { type AxiosError } from 'axios';

const apiClient = axios.create({
  baseURL: '/api/backend',
  headers: { 'Content-Type': 'application/json' },
  // Same-origin — the httpOnly cookie is attached automatically.
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Session gone — bounce to login. The middleware will handle the
      // redirect-back-after-auth flow via ?redirect=.
      const redirect = window.location.pathname + window.location.search;
      window.location.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
