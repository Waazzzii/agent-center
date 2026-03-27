'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getCenterSettings,
  updateCenterSettings,
} from '@/lib/api/center-settings';
import {
  provisionProductDomain,
  checkProductDomain,
  setProductDomainStatus,
  type ProductDomainProvisionResult,
} from '@/lib/api/product-domains';
import {
  fetchCenterLogoBlob,
  uploadCenterLogo,
  deleteCenterLogo,
  uploadCenterFavicon,
  fetchCenterFaviconBlob,
  deleteCenterFavicon,
} from '@/lib/api/center-logos';
import type { CenterOrgSettings, DomainProvisioningStatus } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Globe, Copy, Check, ExternalLink, AlertCircle, Settings, Palette, Upload, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;
const MAX_VERIFY_MS    = 30 * 60_000;

const CENTER_CSS_VARIABLES = [
  { name: '--background',         description: 'Page background' },
  { name: '--foreground',         description: 'Primary text' },
  { name: '--card',               description: 'Card surfaces' },
  { name: '--primary',            description: 'Brand / links' },
  { name: '--primary-foreground', description: 'Text on primary' },
  { name: '--secondary',          description: 'Secondary surfaces' },
  { name: '--muted',              description: 'Subtle backgrounds' },
  { name: '--muted-foreground',   description: 'Subdued text' },
  { name: '--accent',             description: 'Accent / highlights' },
  { name: '--border',             description: 'Borders & dividers' },
  { name: '--radius',             description: 'Corner radius' },
] as const;

const CENTER_THEME_DEFAULTS = `/*
 * ─── Custom Theme CSS — Wazzi Defaults Reference ─────────────────────────
 *
 * All values below are the current Wazzi defaults — change only what you
 * need. Any token not listed falls back to the Wazzi default automatically.
 *
 * Colour format options (all are valid CSS):
 *   hex:    #a855f7
 *   rgb:    rgb(168, 85, 247)
 *   hsl:    hsl(270, 91%, 65%)
 *   oklch:  oklch(0.7 0.24 295)    ← perceptually uniform, recommended
 * ─────────────────────────────────────────────────────────────────────────
 */

:root {
  /* ── Primary brand colour ────────────────────────────────────────────── */
  --primary: oklch(0.7 0.24 295);           /* Buttons, links, active nav items, badges */
  --primary-foreground: oklch(1 0 0);       /* Text/icons placed on primary-coloured surfaces */

  /* ── Accent colour ───────────────────────────────────────────────────── */
  --accent: oklch(0.7 0.2 35);             /* Highlight badges, notification chips, callouts */
  --accent-foreground: oklch(1 0 0);        /* Text/icons placed on accent-coloured surfaces */

  /* ── Focus ring ──────────────────────────────────────────────────────── */
  --ring: oklch(0.7 0.24 295);             /* Keyboard focus outline — usually matches primary */

  /* ── Admin sidebar (light mode) ─────────────────────────────────────── */
  --sidebar: oklch(0.98 0.01 295);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.7 0.24 295);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.95 0.02 295);
  --sidebar-accent-foreground: oklch(0.145 0 0);
  --sidebar-border: oklch(0.9 0.02 295);
  --sidebar-ring: oklch(0.7 0.24 295);

  /* ── Charts ──────────────────────────────────────────────────────────── */
  --chart-1: oklch(0.7 0.24 295);
  --chart-2: oklch(0.6 0.22 250);
  --chart-3: oklch(0.7 0.2 35);
  --chart-4: oklch(0.75 0.2 280);
  --chart-5: oklch(0.65 0.18 260);
}

.dark {
  --primary: oklch(0.78 0.2 295);
  --primary-foreground: oklch(0.145 0 0);
  --accent: oklch(0.75 0.16 35);
  --accent-foreground: oklch(0.145 0 0);
  --ring: oklch(0.78 0.2 295);
  --sidebar: oklch(0.18 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.32 0.06 295);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.25 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.78 0.2 295);
  --chart-1: oklch(0.78 0.2 295);
  --chart-2: oklch(0.7 0.18 250);
  --chart-3: oklch(0.75 0.16 35);
  --chart-4: oklch(0.82 0.16 280);
  --chart-5: oklch(0.75 0.14 260);
}`;

// ── Domain status badge ───────────────────────────────────────────────────────

function DomainStatusBadge({ status }: { status: DomainProvisioningStatus | 'issuing' | null }) {
  if (!status) return null;

  if (status === 'issuing') return (
    <Badge variant="secondary" className="gap-1.5 font-normal">
      <span className="h-2 w-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Issuing…
    </Badge>
  );
  if (status === 'verifying') return (
    <Badge variant="secondary" className="gap-1.5 font-normal">
      <span className="h-2 w-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Verifying…
    </Badge>
  );
  if (status === 'active') return (
    <Badge className="gap-1 bg-green-600 hover:bg-green-600">
      <Check className="h-3 w-3" /> Active
    </Badge>
  );
  if (status === 'failed') return (
    <Badge variant="destructive" className="gap-1">
      <AlertCircle className="h-3 w-3" /> Setup failed
    </Badge>
  );
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdministrationPage() {
  const router = useRouter();
  const { selectedOrgId, selectedOrgName, isOrgAdminView } = useAdminViewStore();
  const permitted = useRequirePermission('admin_products');

  const [settings, setSettings]   = useState<CenterOrgSettings | null>(null);
  const [logoUrlFromApi, setLogoUrlFromApi] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [copiedDomain, setCopiedDomain]           = useState<string | null>(null);

  // Theme tab state
  const [nameInput, setNameInput]           = useState('');
  const [customThemeInput, setCustomThemeInput] = useState('');
  const [themeTabSaving, setThemeTabSaving] = useState(false);
  const [themeTabSaved, setThemeTabSaved]   = useState(false);
  const [showVarsRef, setShowVarsRef]       = useState(false);

  // Logo state
  const [logoUrl, setLogoUrl]             = useState<string | null>(null);
  const [logoLoading, setLogoLoading]     = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoDeleting, setLogoDeleting]   = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Favicon state
  const [faviconUrl, setFaviconUrl]             = useState<string | null>(null);
  const [faviconLoading, setFaviconLoading]     = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [faviconDeleting, setFaviconDeleting]   = useState(false);
  const [faviconUrlFromApi, setFaviconUrlFromApi] = useState<string | null>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [autoDomainStatus, setAutoDomainStatus]     = useState<DomainProvisioningStatus | 'issuing' | null>(null);
  const [customDomainStatus, setCustomDomainStatus] = useState<DomainProvisioningStatus | 'issuing' | null>(null);


  const [lastProvision, setLastProvision] = useState<ProductDomainProvisionResult | null>(null);

  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyStartRef = useRef<number>(0);
  const pollingTypeRef = useRef<'auto' | 'custom' | null>(null);

  // ── Polling helpers ────────────────────────────────────────────────────────

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    pollingTypeRef.current = null;
  };

  const startPolling = (type: 'auto' | 'custom', elapsedAlreadyMs = 0) => {
    if (!selectedOrgId) return;
    stopPolling();
    pollingTypeRef.current = type;
    verifyStartRef.current = Date.now() - elapsedAlreadyMs;

    const setStatus = type === 'auto' ? setAutoDomainStatus : setCustomDomainStatus;
    const orgId     = selectedOrgId;

    const poll = async () => {
      if (Date.now() - verifyStartRef.current >= MAX_VERIFY_MS) {
        stopPolling();
        setStatus('failed');
        try { await setProductDomainStatus(orgId, 'ac', type, 'failed'); } catch { /* best-effort */ }
        return;
      }
      try {
        const result = await checkProductDomain(orgId, 'ac', type);
        if (result.reachable) {
          stopPolling();
          setStatus('active');
          const fresh = await getCenterSettings(orgId);
          setSettings(fresh.settings);
        }
      } catch { /* ignore transient errors */ }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
  };

  useEffect(() => () => stopPolling(), []);

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) { router.push('/organizations'); return; }
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, isOrgAdminView]);

  useEffect(() => {
    if (!selectedOrgId) return;
    setLogoUrl(null);
    if (!logoUrlFromApi) { setLogoLoading(false); return; }
    let cancelled = false;
    const loadLogo = async () => {
      setLogoLoading(true);
      try {
        const url = await fetchCenterLogoBlob(selectedOrgId);
        if (!cancelled) { setLogoUrl(url); setLogoLoading(false); }
      } catch {
        if (!cancelled) { setLogoUrl(null); setLogoLoading(false); }
      }
    };
    loadLogo();
    return () => {
      cancelled = true;
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, logoUrlFromApi]);

  useEffect(() => {
    if (!selectedOrgId) return;
    setFaviconUrl(null);
    if (!faviconUrlFromApi) { setFaviconLoading(false); return; }
    let cancelled = false;
    const loadFavicon = async () => {
      try {
        setFaviconLoading(true);
        const url = await fetchCenterFaviconBlob(selectedOrgId);
        if (!cancelled) setFaviconUrl(url);
      } catch { /* failed to load */ }
      finally { if (!cancelled) setFaviconLoading(false); }
    };
    loadFavicon();
    return () => {
      cancelled = true;
      if (faviconUrl) URL.revokeObjectURL(faviconUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, faviconUrlFromApi]);

  const loadSettings = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getCenterSettings(selectedOrgId);
      setSettings(data.settings);
      setLogoUrlFromApi(data.logo_url);
      setFaviconUrlFromApi(data.favicon_url ?? null);
      setCustomDomainInput(data.settings.custom_domain || '');
      setNameInput(data.settings.name || '');
      setCustomThemeInput(data.settings.custom_theme || '');

      const autoStatus   = data.settings.auto_domain_config?.status   ?? null;
      const customStatus = data.settings.custom_domain_config?.status  ?? null;
      setAutoDomainStatus(autoStatus);
      setCustomDomainStatus(customStatus);

      if (autoStatus === 'verifying') {
        const elapsed = elapsedSince(data.settings.auto_domain_config?.status_updated_at);
        if (elapsed < MAX_VERIFY_MS) startPolling('auto', elapsed);
        else markFailed('auto', selectedOrgId, setAutoDomainStatus);
      }
      if (customStatus === 'verifying') {
        const elapsed = elapsedSince(data.settings.custom_domain_config?.status_updated_at);
        if (elapsed < MAX_VERIFY_MS) startPolling('custom', elapsed);
        else markFailed('custom', selectedOrgId, setCustomDomainStatus);
      }
    } catch (error: any) {
      console.warn('Failed to load Administration settings:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const markFailed = async (
    type: 'auto' | 'custom',
    orgId: string,
    setStatus: (s: DomainProvisioningStatus) => void
  ) => {
    setStatus('failed');
    try { await setProductDomainStatus(orgId, 'ac', type, 'failed'); } catch { /* best-effort */ }
  };

  // ── Logo handlers ──────────────────────────────────────────────────────────

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrgId) return;
    setLogoUploading(true);
    try {
      const uploadResult = await uploadCenterLogo(selectedOrgId, file);
      setLogoUrlFromApi(uploadResult.logo_url);
      toast.success('Logo uploaded');
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      setLogoUrl(null);
      setLogoLoading(true);
      try {
        const url = await fetchCenterLogoBlob(selectedOrgId);
        setLogoUrl(url);
      } catch { /* fetch failed after upload */ }
      finally { setLogoLoading(false); }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to upload logo');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleLogoDelete = async () => {
    if (!selectedOrgId) return;
    setLogoDeleting(true);
    try {
      await deleteCenterLogo(selectedOrgId);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      setLogoUrl(null);
      setLogoUrlFromApi(null);
      toast.success('Logo removed');
    } catch {
      toast.error('Failed to remove logo');
    } finally {
      setLogoDeleting(false);
    }
  };

  // ── Favicon handlers ────────────────────────────────────────────────────────

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrgId) return;
    setFaviconUploading(true);
    try {
      const uploadResult = await uploadCenterFavicon(selectedOrgId, file);
      setFaviconUrlFromApi(uploadResult.favicon_url);
      toast.success('Favicon uploaded');
      if (faviconUrl) URL.revokeObjectURL(faviconUrl);
      setFaviconUrl(null);
      setFaviconLoading(true);
      try {
        const url = await fetchCenterFaviconBlob(selectedOrgId);
        setFaviconUrl(url);
      } catch { /* fetch failed after upload */ }
      finally { setFaviconLoading(false); }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to upload favicon');
    } finally {
      setFaviconUploading(false);
      e.target.value = '';
    }
  };

  const handleFaviconDelete = async () => {
    if (!selectedOrgId) return;
    setFaviconDeleting(true);
    try {
      await deleteCenterFavicon(selectedOrgId);
      if (faviconUrl) URL.revokeObjectURL(faviconUrl);
      setFaviconUrl(null);
      setFaviconUrlFromApi(null);
      toast.success('Favicon removed');
    } catch {
      toast.error('Failed to remove favicon');
    } finally {
      setFaviconDeleting(false);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggle = async (enabled: boolean) => {
    if (!selectedOrgId) return;
    try {
      setSaving(true);
      const enablePayload = enabled ? {
        is_enabled: true,
        ...(!settings?.name && selectedOrgName ? { name: selectedOrgName } : {}),
      } : { is_enabled: false };

      const data = await updateCenterSettings(selectedOrgId, enablePayload);
      setSettings(data.settings);
      if (enabled && data.settings.name) {
        setNameInput(data.settings.name);
        setCustomThemeInput(data.settings.custom_theme || '');
      }

      if (enabled) {
        const currentStatus = data.settings.auto_domain_config?.status;
        if (!currentStatus || currentStatus === 'failed') {
          setAutoDomainStatus('issuing');
          try {
            const result = await provisionProductDomain(selectedOrgId, 'ac', 'auto');
            setLastProvision(result);
            setSettings(result.settings);
            const next = result.settings.auto_domain_config?.status ?? null;
            setAutoDomainStatus(next);
            if (next === 'verifying') startPolling('auto');
          } catch (err: any) {
            setAutoDomainStatus('failed');
            toast.error('Domain provisioning failed: ' + (err.message ?? 'Unknown error'));
          }
        } else if (currentStatus === 'verifying') {
          setAutoDomainStatus('verifying');
          startPolling('auto');
        }
        toast.success('Administration enabled');
      } else {
        stopPolling();
        setAutoDomainStatus(data.settings.auto_domain_config?.status ?? null);
        toast.success('Administration disabled');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomDomain = async () => {
    if (!selectedOrgId) return;
    const domain = customDomainInput.trim().toLowerCase().replace(/^https?:\/\//, '');
    if (!domain) { toast.error('Please enter a domain'); return; }
    try {
      setSaving(true);
      setCustomDomainStatus('issuing');
      const result = await provisionProductDomain(selectedOrgId, 'ac', 'custom', domain);
      setLastProvision(result);
      setSettings(result.settings);
      setCustomDomainInput(domain);
      const next = result.settings.custom_domain_config?.status ?? null;
      setCustomDomainStatus(next);
      if (next === 'verifying') startPolling('custom');
      toast.success('Custom domain saved — add the CNAME record shown below');
    } catch (error: any) {
      setCustomDomainStatus(null);
      toast.error(error.response?.data?.message || error.message || 'Failed to save custom domain');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCustomDomain = async () => {
    if (!selectedOrgId) return;
    try {
      setSaving(true);
      if (pollingTypeRef.current === 'custom') stopPolling();
      const data = await updateCenterSettings(selectedOrgId, { custom_domain: null });
      setSettings(data.settings);
      setCustomDomainInput('');
      setCustomDomainStatus(null);
      setLastProvision(null);
      toast.success('Custom domain removed');
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to remove custom domain');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryAutoDomain = async () => {
    if (!selectedOrgId) return;
    setAutoDomainStatus('issuing');
    try {
      const result = await provisionProductDomain(selectedOrgId, 'ac', 'auto');
      setLastProvision(result);
      setSettings(result.settings);
      const next = result.settings.auto_domain_config?.status ?? null;
      setAutoDomainStatus(next);
      if (next === 'verifying') startPolling('auto');
    } catch { setAutoDomainStatus('failed'); }
  };

  const handleSaveThemeTab = async () => {
    if (!selectedOrgId) return;
    try {
      setThemeTabSaving(true);
      setThemeTabSaved(false);
      const data = await updateCenterSettings(selectedOrgId, {
        name: nameInput.trim() || null,
        custom_theme: customThemeInput.trim() || null,
      });
      setSettings(data.settings);
      setThemeTabSaved(true);
      toast.success('Theme settings saved');
      setTimeout(() => setThemeTabSaved(false), 3000);
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to save theme settings');
    } finally {
      setThemeTabSaving(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedDomain(text);
    setTimeout(() => setCopiedDomain(null), 2000);
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const isEnabled   = settings?.is_enabled ?? false;
  const isLive      = isEnabled && autoDomainStatus === 'active';
  const displayName = settings?.name || selectedOrgName;

  const cnameTarget =
    lastProvision?.cname_target ??
    (settings?.auto_domain_config?.dns?.provisioned_at
      ? settings?.auto_domain_config?.dns?.record_id
      : null);

  const customDnsInstructions =
    lastProvision?.domain_type === 'custom' ? lastProvision.dns_instructions : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Administration</h1>
        <p className="text-muted-foreground">Manage the Administration Center for {displayName}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !isEnabled ? (

        /* ── Disabled state ───────────────────────────────────────────────── */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Administration Center is disabled</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Enable the Administration Center to provision a management portal for {selectedOrgName}.
            </p>
            <Button onClick={() => handleToggle(true)} disabled={saving}>
              {saving ? 'Enabling…' : 'Enable Administration'}
            </Button>
          </CardContent>
        </Card>

      ) : (

        /* ── Enabled state ────────────────────────────────────────────────── */
        <Tabs defaultValue="settings" className="w-full">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="theme">
                <Palette className="h-4 w-4 mr-2" />
                Theme
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleToggle(false)}
              disabled={saving}
            >
              Disable
            </Button>
          </div>

          {/* ── Settings Tab ─────────────────────────────────────────────── */}
          <TabsContent value="settings" className="mt-6 space-y-6">

            {isLive && settings && settings.auto_domain && (
              <Alert>
                <Globe className="h-4 w-4" />
                <AlertDescription className="flex flex-wrap items-center gap-x-1">
                  Your Administration Center is live at{' '}
                  <a href={`https://${settings.auto_domain}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                    {settings.auto_domain}
                  </a>
                  {customDomainStatus === 'active' && settings.custom_domain && (
                    <>
                      {' '}and{' '}
                      <a href={`https://${settings.custom_domain}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                        {settings.custom_domain}
                      </a>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Domain Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Domain Configuration</CardTitle>
                <CardDescription>
                  Your assigned domain is always available. Optionally add a custom domain — both will be served simultaneously.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">Assigned Domain</Label>
                    <DomainStatusBadge status={autoDomainStatus} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Auto-generated from your organization slug. Always available — cannot be removed.
                  </p>
                  {settings?.auto_domain ? (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 items-center rounded-md border bg-muted px-3 py-2 text-sm font-mono">
                        <Globe className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {settings.auto_domain}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(settings.auto_domain!)}>
                        {copiedDomain === settings.auto_domain ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`https://${settings.auto_domain}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Domain will appear here once provisioned.</p>
                  )}
                  {autoDomainStatus === 'verifying' && (
                    <p className="text-xs text-muted-foreground">
                      DNS provisioned. Checking if the domain is reachable — rechecking every 30 seconds. This typically takes 1–5 minutes.
                    </p>
                  )}
                  {autoDomainStatus === 'failed' && (
                    <p className="text-xs text-destructive">
                      Domain could not be verified after 30 minutes. Check your DNS / Cloudflare configuration and{' '}
                      <button className="underline" onClick={handleRetryAutoDomain}>try again</button>.
                    </p>
                  )}
                  {cnameTarget && autoDomainStatus !== 'active' && settings?.auto_domain && (
                    <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                      CNAME: {settings.auto_domain} → {cnameTarget}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">Custom Domain</Label>
                    <DomainStatusBadge status={customDomainStatus} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter your own domain (e.g. <code>admin.yourcompany.com</code>). After saving, add the CNAME record shown below at your DNS provider.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="admin.yourcompany.com"
                      value={customDomainInput}
                      onChange={(e) => setCustomDomainInput(e.target.value.toLowerCase().replace(/^https?:\/\//, ''))}
                      className="font-mono text-sm"
                    />
                    <Button
                      onClick={handleSaveCustomDomain}
                      disabled={saving || !customDomainInput.trim() || customDomainInput.trim() === settings?.custom_domain}
                    >
                      {saving ? 'Saving…' : settings?.custom_domain ? 'Update' : 'Save'}
                    </Button>
                    {settings?.custom_domain && (
                      <Button variant="destructive" onClick={handleRemoveCustomDomain} disabled={saving}>
                        Remove
                      </Button>
                    )}
                  </div>

                  {settings?.custom_domain && customDnsInstructions && (
                    <div className="rounded-md bg-muted p-3 text-xs space-y-1.5">
                      <p className="font-medium">Add this DNS record at your provider:</p>
                      <div className="font-mono space-y-0.5">
                        <div className="flex gap-2"><span className="w-12 text-muted-foreground">Type</span><span>{customDnsInstructions.type}</span></div>
                        <div className="flex gap-2"><span className="w-12 text-muted-foreground">Name</span><span>{customDnsInstructions.name}</span></div>
                        <div className="flex items-center gap-2">
                          <span className="w-12 text-muted-foreground">Value</span>
                          <span className="break-all">{customDnsInstructions.value}</span>
                          <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => copyToClipboard(customDnsInstructions.value)}>
                            {copiedDomain === customDnsInstructions.value ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </div>
                        <div className="flex gap-2"><span className="w-12 text-muted-foreground">Proxy</span><span>None (DNS only)</span></div>
                      </div>
                      <p className="text-muted-foreground">{customDnsInstructions.note}</p>
                    </div>
                  )}

                  {customDomainStatus === 'verifying' && (
                    <p className="text-xs text-muted-foreground">
                      Waiting for DNS propagation — checking every 30 seconds (up to 30 minutes).
                    </p>
                  )}
                  {customDomainStatus === 'failed' && (
                    <p className="text-xs text-destructive">
                      Could not verify the custom domain after 30 minutes. Check that the CNAME record above is correctly set at your DNS provider.
                    </p>
                  )}
                </div>

              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Theme Tab ────────────────────────────────────────────────── */}
          <TabsContent value="theme" className="mt-6 space-y-6">

            <Card>
              <CardHeader>
                <CardTitle>Administration Center Name</CardTitle>
                <CardDescription>
                  Set a display name shown on the Administration Center portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="center-name">Name</Label>
                  <Input
                    id="center-name"
                    placeholder={selectedOrgName || 'Administration Center'}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Defaults to your organization name if not set.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Logo */}
            <Card>
              <CardHeader>
                <CardTitle>Logo</CardTitle>
                <CardDescription>Upload a logo to display on your Administration Center portal.</CardDescription>
              </CardHeader>
              <CardContent>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                {logoLoading || (logoUrlFromApi && !logoUrl) ? (
                  <div className="flex items-center gap-4 h-16">
                    <div className="h-16 w-[200px] rounded border bg-muted animate-pulse" />
                    <div className="text-sm text-muted-foreground">Loading logo...</div>
                  </div>
                ) : logoUrl ? (
                  <div className="flex items-center gap-4">
                    <img src={logoUrl} alt="Admin Logo" className="h-16 max-w-[200px] object-contain rounded border p-2 bg-white" />
                    <Button variant="outline" size="sm" onClick={handleLogoDelete} disabled={logoDeleting}>
                      {logoDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => !logoUploading && logoInputRef.current?.click()}>
                    {logoUploading ? <Loader2 className="h-8 w-8 text-muted-foreground mb-2 animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground mb-2" />}
                    <p className="text-sm font-medium">{logoUploading ? 'Uploading…' : 'Upload logo'}</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG or SVG — max 2 MB</p>
                    <Button variant="outline" size="sm" className="mt-4" disabled={logoUploading} onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click(); }}>
                      Choose file
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Favicon */}
            <Card>
              <CardHeader>
                <CardTitle>Favicon</CardTitle>
                <CardDescription>Upload a favicon to display in the browser tab for your Administration Center.</CardDescription>
              </CardHeader>
              <CardContent>
                <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon" className="hidden" onChange={handleFaviconUpload} />
                {faviconLoading || (faviconUrlFromApi && !faviconUrl) ? (
                  <div className="flex items-center gap-4 h-12">
                    <div className="h-12 w-12 rounded border bg-muted animate-pulse" />
                    <div className="text-sm text-muted-foreground">Loading favicon...</div>
                  </div>
                ) : faviconUrl ? (
                  <div className="flex items-center gap-4">
                    <img src={faviconUrl} alt="Admin Favicon" className="h-12 w-12 object-contain rounded border p-2 bg-white" />
                    <Button variant="outline" size="sm" onClick={handleFaviconDelete} disabled={faviconDeleting}>
                      {faviconDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => !faviconUploading && faviconInputRef.current?.click()}>
                    {faviconUploading ? <Loader2 className="h-8 w-8 text-muted-foreground mb-2 animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground mb-2" />}
                    <p className="text-sm font-medium">{faviconUploading ? 'Uploading…' : 'Upload favicon'}</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG or ICO — max 512 KB</p>
                    <Button variant="outline" size="sm" className="mt-4" disabled={faviconUploading} onClick={(e) => { e.stopPropagation(); faviconInputRef.current?.click(); }}>
                      Choose file
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Custom Theme CSS */}
            <Card>
              <CardHeader>
                <CardTitle>Custom Theme CSS</CardTitle>
                <CardDescription>
                  Override CSS variables to brand the Administration Center portal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <button
                  type="button"
                  onClick={() => setShowVarsRef((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showVarsRef ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Available CSS variables
                </button>

                {showVarsRef && (
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
                      {CENTER_CSS_VARIABLES.map(({ name, description }) => (
                        <div key={name} className="flex items-baseline gap-2 min-w-0">
                          <code className="shrink-0 text-xs font-mono text-primary">{name}</code>
                          <span className="truncate text-xs text-muted-foreground">{description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg overflow-hidden border">
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#1a2332] border-b border-slate-200 dark:border-[#2a3a4e] px-3 py-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                    <span className="ml-2 text-xs text-slate-400 dark:text-[#8a9bb0] font-mono">custom-theme.css</span>
                    <button
                      type="button"
                      onClick={() => setCustomThemeInput(CENTER_THEME_DEFAULTS)}
                      className="ml-auto text-xs text-slate-400 dark:text-[#8a9bb0] hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:pointer-events-none disabled:opacity-40"
                    >
                      Load defaults
                    </button>
                  </div>
                  <textarea
                    value={customThemeInput}
                    onChange={(e) => setCustomThemeInput(e.target.value)}
                    placeholder="/* Paste custom CSS here, or click 'Load defaults' to start from the Wazzi defaults */"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    rows={14}
                    className={cn(
                      'w-full resize-none bg-slate-50 dark:bg-[#0f1419] px-4 py-3 font-mono text-sm text-slate-900 dark:text-[#e8e8e8]',
                      'placeholder:text-slate-300 dark:placeholder:text-[#4a5a6e] focus:outline-none',
                      'leading-relaxed tracking-wide',
                    )}
                  />
                </div>

                <p className="text-xs text-muted-foreground">Leave empty to use the default theme.</p>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={handleSaveThemeTab}
                disabled={themeTabSaving}
                className="gap-2 min-w-[140px]"
              >
                {themeTabSaving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                ) : themeTabSaved ? (
                  <><Check className="h-4 w-4" />Saved</>
                ) : (
                  'Save Theme Settings'
                )}
              </Button>
            </div>

          </TabsContent>

        </Tabs>

      )}
    </div>
  );
}

// ── Util ──────────────────────────────────────────────────────────────────────

function elapsedSince(isoTimestamp?: string): number {
  if (!isoTimestamp) return 0;
  return Math.max(0, Date.now() - new Date(isoTimestamp).getTime());
}
