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
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const redirect = window.location.pathname + window.location.search;
      window.location.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
    }
    return Promise.reject(error);
  }
);

export default agentClient;
