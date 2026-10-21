/**
 * Agent API Client
 *
 * Axios instance pointing at the in-app BFF catchall (/api/agent/*),
 * which forwards to agent-backend with the cookie-derived bearer token.
 */

import axios from 'axios';

const agentClient = axios.create({
  baseURL: '/api/agent',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

agentClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined'
        && !window.location.pathname.startsWith('/auth')) {
      // Never from an /auth/* page: a 401 there (the sign-in page mounts the same
      // providers) re-navigated to /auth/login every few hundred ms, cancelling
      // that page's own redirect to sign-in — a loop (prod 2026-10-21; the
      // admin console's client already had this guard).
      const redirect = window.location.pathname + window.location.search;
      window.location.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
    }
    return Promise.reject(error);
  }
);

export default agentClient;
