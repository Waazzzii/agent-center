import { headers } from 'next/headers';
import { getAgentCenterBranding } from '@/lib/branding';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get('host') ?? '';

  const branding = await getAgentCenterBranding(host);

  const logoVersion = branding.logo_storage_path?.split('/').pop()?.split('.')[0]?.slice(-12);
  const hasLogo = !!branding.logo_storage_path;

  return <LoginForm hasLogo={hasLogo} logoVersion={logoVersion} />;
}
