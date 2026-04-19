/**
 * Agent API Client
 * Axios instance pointing at agent-backend (agents, skills, approvals,
 * execution history, browser HITL).
 *
 * Uses the same bearer token as apiClient — agent-backend validates it by
 * proxying to wazzi-backend's /products/me.
 */

import axios from 'axios';
import { redirectToAuth } from '../auth/oauth';

const agentClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' },
});

agentClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Redirect to login on 401
agentClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      void redirectToAuth();
    }
    return Promise.reject(error);
  }
);

export default agentClient;
