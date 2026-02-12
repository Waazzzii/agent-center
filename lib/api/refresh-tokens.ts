/**
 * Refresh Tokens API Client
 */

import apiClient from './client';
import { RefreshToken, RefreshTokenStats } from '@/types/api.types';

export interface ListRefreshTokensParams {
  user_email?: string;
  client_id?: string;
  status?: 'active' | 'expired' | 'revoked';
  limit?: number;
  offset?: number;
}

export interface ListRefreshTokensResponse {
  tokens: RefreshToken[];
  total: number;
  limit: number;
  offset: number;
}

export interface RevokeTokenDto {
  reason?: string;
}

export interface CleanupResponse {
  message: string;
  deleted_count: number;
}

export interface RevokeAllResponse {
  message: string;
  revoked_count: number;
}

// List refresh tokens with filtering
export async function getRefreshTokens(params?: ListRefreshTokensParams): Promise<ListRefreshTokensResponse> {
  const response = await apiClient.get('/admin/refresh-tokens', { params });
  return response.data;
}

// Get token statistics
export async function getRefreshTokenStats(): Promise<RefreshTokenStats> {
  const response = await apiClient.get('/admin/refresh-tokens/stats');
  return response.data;
}

// Get specific refresh token
export async function getRefreshToken(id: string): Promise<RefreshToken> {
  const response = await apiClient.get(`/admin/refresh-tokens/${id}`);
  return response.data;
}

// Revoke specific token
export async function revokeRefreshToken(id: string, data?: RevokeTokenDto): Promise<{ message: string; token: RefreshToken }> {
  const response = await apiClient.post(`/admin/refresh-tokens/${id}/revoke`, data);
  return response.data;
}

// Revoke all tokens for a user
export async function revokeAllUserTokens(userEmail: string, data?: RevokeTokenDto): Promise<RevokeAllResponse> {
  const response = await apiClient.post(`/admin/refresh-tokens/user/${userEmail}/revoke-all`, data);
  return response.data;
}

// Cleanup expired tokens
export async function cleanupExpiredTokens(): Promise<CleanupResponse> {
  const response = await apiClient.post('/admin/refresh-tokens/cleanup');
  return response.data;
}
