/**
 * OAuth PKCE Flow
 * Handles OAuth 2.0 Authorization Code flow with PKCE
 */

/**
 * Generate a random code verifier (43-128 characters)
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

/**
 * Generate code challenge from verifier using SHA-256
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}

/**
 * Base64 URL encode (without padding)
 */
function base64URLEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Initiate OAuth login flow
 * Redirects to backend OAuth authorization endpoint
 */
export async function initiateLogin(): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateCodeVerifier(); // Generate random state

  // Store verifier and state for later use in callback
  sessionStorage.setItem('pkce_verifier', codeVerifier);
  sessionStorage.setItem('oauth_state', state);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const clientId = process.env.NEXT_PUBLIC_ADMIN_CLIENT_ID || 'admin-console';
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI || `${window.location.origin}/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state,
  });

  window.location.href = `${apiUrl}/authorize?${params}`;
}

/**
 * Exchange authorization code for tokens
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
  const clientId = process.env.NEXT_PUBLIC_ADMIN_CLIENT_ID || '';
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI || `${window.location.origin}/callback`;

  const tokenUrl = `${apiUrl}/oauth/token`;
  const params = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  };

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    let errorMessage = `Failed to exchange code for tokens (HTTP ${response.status})`;
    try {
      const error = await response.json();
      errorMessage = error.message || error.error_description || error.error || errorMessage;
      // Include additional details if available
      if (error.error) {
        errorMessage += ` - ${error.error}`;
      }
      if (error.error_description) {
        errorMessage += `: ${error.error_description}`;
      }
    } catch (e) {
      // Response wasn't JSON
      errorMessage += ' - Invalid response format';
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();

  // Clear verifier from session
  sessionStorage.removeItem('pkce_verifier');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh access token using refresh token
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
  const clientId = process.env.NEXT_PUBLIC_ADMIN_CLIENT_ID || 'admin-console';

  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
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
 * Logout - revoke tokens
 */
export async function logout(): Promise<void> {
  // Clear local storage
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');

  // Redirect to login
  window.location.href = '/login';
}
