/**
 * OAuth client helpers for agent-center.
 *
 * Sign-in / sign-up / reset UI is rendered by auth.wazzi.io. This product:
 *   - redirects to auth.wazzi.io for every auth entry point
 *   - receives users back at /callback with a fresh auth code
 *   - exchanges + refreshes tokens locally (tokens never cross origins)
 */

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}

function base64URLEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getClientId(): string {
  return process.env.NEXT_PUBLIC_CLIENT_ID || 'agent-center';
}

function getRedirectUri(): string {
  return (
    process.env.NEXT_PUBLIC_REDIRECT_URI ||
    `${window.location.origin}/callback`
  );
}

function getAuthUrl(): string {
  return process.env.NEXT_PUBLIC_AUTH_URL || 'https://auth.wazzi.io';
}

/**
 * Bounce the browser to the centralized auth UI.
 */
export async function redirectToAuth(
  target: 'login' | 'signup' = 'login',
  opts: { email?: string } = {},
): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateCodeVerifier();

  sessionStorage.setItem('pkce_verifier', codeVerifier);
  sessionStorage.setItem('oauth_state', state);

  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    scope: 'openid email profile',
  });
  if (opts.email) params.set('email', opts.email);

  window.location.href = `${getAuthUrl()}/${target}?${params.toString()}`;
}

/**
 * Back-compat alias so existing callers (e.g. login button) keep working.
 */
export const initiateLogin = () => redirectToAuth('login');

/**
 * Exchange authorization code for tokens. Called by /callback.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const codeVerifier = sessionStorage.getItem('pkce_verifier');
  if (!codeVerifier) {
    throw new Error('No code verifier found in session');
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const tokenUrl = `${apiUrl}/oauth/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      client_id: getClientId(),
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Failed to exchange code for tokens (HTTP ${response.status})`;
    try {
      const error = await response.json();
      errorMessage = error.message || error.error_description || error.error || errorMessage;
      if (error.error) errorMessage += ` - ${error.error}`;
      if (error.error_description) errorMessage += `: ${error.error_description}`;
    } catch {
      errorMessage += ' - Invalid response format';
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  sessionStorage.removeItem('pkce_verifier');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh access token using refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  signal?: AbortSignal,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: getClientId(),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

/**
 * Logout — clear tokens and bounce to the centralized auth UI.
 */
export async function logout(): Promise<void> {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  await redirectToAuth('login');
}
