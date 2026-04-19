import { LoginRedirect } from "./login-form";

/**
 * Sign-in is rendered by auth.wazzi.io. This page exists only as a stable
 * redirect target for the middleware auth guard — it generates fresh PKCE
 * in the browser (verifier stays in this product's cookie jar) and bounces
 * the user out to the centralized auth UI.
 */
export default function LoginPage() {
  return <LoginRedirect />;
}
