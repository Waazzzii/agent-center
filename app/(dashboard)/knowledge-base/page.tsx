'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  getKbSettings,
  updateKbSettings,
  provisionDomain,
  checkDomain,
  setDomainStatus,
} from '@/lib/api/kb-settings';
import {
  fetchKbLogoBlob,
  uploadKbLogo,
  deleteKbLogo,
} from '@/lib/api/kb-logos';
import type { KbOrgSettings, DomainProvisioningStatus, ProvisionDomainResult } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Copy, Check, Globe, ExternalLink, AlertCircle, Settings, Palette, Upload, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;      // 30 seconds between reachability checks
const MAX_VERIFY_MS    = 30 * 60_000; // 30 minutes before declaring failure

const KB_CSS_VARIABLES = [
  { name: '--background',       description: 'Page background' },
  { name: '--foreground',       description: 'Primary text' },
  { name: '--card',             description: 'Card surfaces' },
  { name: '--primary',          description: 'Brand / links' },
  { name: '--primary-foreground', description: 'Text on primary' },
  { name: '--secondary',        description: 'Secondary surfaces' },
  { name: '--muted',            description: 'Subtle backgrounds' },
  { name: '--muted-foreground', description: 'Subdued text' },
  { name: '--accent',           description: 'Accent / highlights' },
  { name: '--border',           description: 'Borders & dividers' },
  { name: '--radius',           description: 'Corner radius' },
] as const;

const KB_THEME_DEFAULTS = `/*
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
  --sidebar: oklch(0.98 0.01 295);              /* Sidebar background colour */
  --sidebar-foreground: oklch(0.145 0 0);       /* Sidebar text and icon colour */
  --sidebar-primary: oklch(0.7 0.24 295);       /* Active nav item highlight background */
  --sidebar-primary-foreground: oklch(1 0 0);   /* Text on active nav item */
  --sidebar-accent: oklch(0.95 0.02 295);       /* Hovered nav item background */
  --sidebar-accent-foreground: oklch(0.145 0 0); /* Text on hovered nav item */
  --sidebar-border: oklch(0.9 0.02 295);        /* Dividers between sidebar sections */
  --sidebar-ring: oklch(0.7 0.24 295);          /* Focus ring inside the sidebar */

  /* ── Charts ──────────────────────────────────────────────────────────── */
  --chart-1: oklch(0.7 0.24 295);          /* Primary chart series — bar fill, line colour */
  --chart-2: oklch(0.6 0.22 250);          /* Secondary chart series */
  --chart-3: oklch(0.7 0.2 35);            /* Tertiary chart series */
  --chart-4: oklch(0.75 0.2 280);          /* Fourth chart series */
  --chart-5: oklch(0.65 0.18 260);         /* Fifth chart series */
}

.dark {
  /* ── Primary brand colour (dark mode) ───────────────────────────────── */
  --primary: oklch(0.78 0.2 295);          /* Lightened for legibility on dark backgrounds */
  --primary-foreground: oklch(0.145 0 0);  /* Dark text on the lighter primary surface */

  /* ── Accent colour (dark mode) ───────────────────────────────────────── */
  --accent: oklch(0.75 0.16 35);           /* Lightened accent for dark mode */
  --accent-foreground: oklch(0.145 0 0);   /* Dark text on the lighter accent surface */

  /* ── Focus ring (dark mode) ──────────────────────────────────────────── */
  --ring: oklch(0.78 0.2 295);             /* Lighter focus ring for dark backgrounds */

  /* ── Admin sidebar (dark mode) ───────────────────────────────────────── */
  --sidebar: oklch(0.18 0 0);                    /* Sidebar background — neutral dark gray */
  --sidebar-foreground: oklch(0.985 0 0);        /* Light text on dark sidebar */
  --sidebar-primary: oklch(0.32 0.06 295);       /* Brand icon box bg — dark muted purple */
  --sidebar-primary-foreground: oklch(0.985 0 0); /* Icon colour on brand icon bg */
  --sidebar-accent: oklch(0.25 0 0);             /* Hovered nav item background */
  --sidebar-accent-foreground: oklch(0.985 0 0); /* Text on hovered nav item */
  --sidebar-border: oklch(1 0 0 / 10%);          /* Subtle sidebar dividers */
  --sidebar-ring: oklch(0.78 0.2 295);

  /* ── Charts (dark mode) ──────────────────────────────────────────────── */
  --chart-1: oklch(0.78 0.2 295);          /* Lightened for visibility on dark backgrounds */
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

export default function KnowledgeBasePage() {
  const router = useRouter();
  const { selectedOrgId, selectedOrgName, isOrgAdminView } = useAdminViewStore();

  const [kbSettings, setKbSettings] = useState<KbOrgSettings | null>(null);
  const [logoUrlFromApi, setLogoUrlFromApi] = useState<string | null>(null);
  const [kbLoading, setKbLoading]   = useState(false);
  const [kbSaving, setKbSaving]     = useState(false);
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [copiedDomain, setCopiedDomain]           = useState<string | null>(null);

  // Theme tab state
  const [kbNameInput, setKbNameInput]       = useState('');
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

  // Local domain status — "issuing" exists only in-flight and is never persisted
  const [autoDomainStatus, setAutoDomainStatus]     = useState<DomainProvisioningStatus | 'issuing' | null>(null);
  const [customDomainStatus, setCustomDomainStatus] = useState<DomainProvisioningStatus | 'issuing' | null>(null);

  // Last provision result — holds dns_instructions so the UI can display them
  const [lastProvision, setLastProvision] = useState<ProvisionDomainResult | null>(null);

  // Polling
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
    pollingTypeRef.current  = type;
    verifyStartRef.current  = Date.now() - elapsedAlreadyMs;

    const setStatus = type === 'auto' ? setAutoDomainStatus : setCustomDomainStatus;
    const orgId     = selectedOrgId;

    const poll = async () => {
      if (Date.now() - verifyStartRef.current >= MAX_VERIFY_MS) {
        stopPolling();
        setStatus('failed');
        try { await setDomainStatus(orgId, type, 'failed'); } catch { /* best-effort */ }
        return;
      }
      try {
        const result = await checkDomain(orgId, type);
        if (result.reachable) {
          stopPolling();
          setStatus('active');
          // Refresh settings so the "live at" link appears
          const fresh = await getKbSettings(orgId);
          setKbSettings(fresh.settings);
        }
      } catch { /* ignore transient errors */ }
    };

    poll(); // immediate first check
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
  };

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) { router.push('/organizations'); return; }
    loadKbSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, isOrgAdminView]);

  // Load logo asynchronously (don't block page render)
  useEffect(() => {
    if (!selectedOrgId) return;

    // Reset logo state when logo URL changes
    setLogoUrl(null);

    // Only fetch if logo exists (from API response)
    if (!logoUrlFromApi) {
      setLogoLoading(false);
      return;
    }

    let cancelled = false;
    const loadLogo = async () => {
      setLogoLoading(true);
      try {
        const url = await fetchKbLogoBlob(selectedOrgId);
        if (!cancelled) {
          setLogoUrl(url);
          setLogoLoading(false);
        }
      } catch {
        // Logo fetch failed - silently ignore
        if (!cancelled) {
          setLogoUrl(null);
          setLogoLoading(false);
        }
      }
    };

    loadLogo();

    return () => {
      cancelled = true;
      // Cleanup object URL if component unmounts
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, logoUrlFromApi]);

  const loadKbSettings = async () => {
    if (!selectedOrgId) return;
    try {
      setKbLoading(true);
      const data = await getKbSettings(selectedOrgId);
      setKbSettings(data.settings);
      setLogoUrlFromApi(data.logo_url); // Store logo_url from API response
      setCustomDomainInput(data.settings.custom_domain || '');
      setKbNameInput(data.settings.name || '');
      setCustomThemeInput(data.settings.custom_theme || '');

      const autoStatus   = data.settings.auto_domain_config?.status   ?? null;
      const customStatus = data.settings.custom_domain_config?.status  ?? null;
      setAutoDomainStatus(autoStatus);
      setCustomDomainStatus(customStatus);

      // Resume polling if the page was closed while verifying
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
      console.warn('Failed to load KB settings:', error.message);
    } finally {
      setKbLoading(false);
    }
  };

  const markFailed = async (
    type: 'auto' | 'custom',
    orgId: string,
    setStatus: (s: DomainProvisioningStatus) => void
  ) => {
    setStatus('failed');
    try { await setDomainStatus(orgId, type, 'failed'); } catch { /* best-effort */ }
  };

  // ── Logo handlers ──────────────────────────────────────────────────────────

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrgId) return;
    setLogoUploading(true);
    try {
      const uploadResult = await uploadKbLogo(selectedOrgId, file);

      // Update logo_url from API (triggers useEffect to load blob)
      setLogoUrlFromApi(uploadResult.logo_url);

      toast.success('Logo uploaded');

      // Fetch the new logo asynchronously
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      setLogoUrl(null);
      setLogoLoading(true);

      try {
        const url = await fetchKbLogoBlob(selectedOrgId);
        setLogoUrl(url);
      } catch {
        // Logo fetch failed after upload
      } finally {
        setLogoLoading(false);
      }
    } catch {
      toast.error('Failed to upload logo');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleLogoDelete = async () => {
    if (!selectedOrgId) return;
    setLogoDeleting(true);
    try {
      await deleteKbLogo(selectedOrgId);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      setLogoUrl(null);

      // Clear logo_url
      setLogoUrlFromApi(null);

      toast.success('Logo removed');
    } catch {
      toast.error('Failed to remove logo');
    } finally {
      setLogoDeleting(false);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleKbToggle = async (enabled: boolean) => {
    if (!selectedOrgId) return;
    try {
      setKbSaving(true);
      const enablePayload = enabled ? {
        is_enabled: true,
        // Default name to the org name on first enable if not already set
        ...(!kbSettings?.name && selectedOrgName ? { name: selectedOrgName } : {}),
        // Default all portals on
        vendor_enabled: true,
        internal_enabled: true,
        owner_enabled: true,
        guest_enabled: true,
      } : { is_enabled: false };

      const data = await updateKbSettings(selectedOrgId, enablePayload);
      setKbSettings(data.settings);
      if (enabled && data.settings.name) {
        setKbNameInput(data.settings.name);
        setCustomThemeInput(data.settings.custom_theme || '');
      }

      if (enabled) {
        const currentStatus = data.settings.auto_domain_config?.status;
        if (!currentStatus || currentStatus === 'failed') {
          // Fresh provision
          setAutoDomainStatus('issuing');
          try {
            const result = await provisionDomain(selectedOrgId, 'wazzi');
            setLastProvision(result);
            setKbSettings(result.settings);
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
        toast.success('Knowledge Base enabled');
      } else {
        stopPolling();
        setAutoDomainStatus(data.settings.auto_domain_config?.status ?? null);
        toast.success('Knowledge Base disabled');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to update KB settings');
    } finally {
      setKbSaving(false);
    }
  };

  const handleSaveCustomDomain = async () => {
    if (!selectedOrgId) return;
    const domain = customDomainInput.trim().toLowerCase().replace(/^https?:\/\//, '');
    if (!domain) { toast.error('Please enter a domain'); return; }
    try {
      setKbSaving(true);
      setCustomDomainStatus('issuing');
      const result = await provisionDomain(selectedOrgId, 'custom', domain);
      setLastProvision(result);
      setKbSettings(result.settings);
      setCustomDomainInput(domain);
      const next = result.settings.custom_domain_config?.status ?? null;
      setCustomDomainStatus(next);
      if (next === 'verifying') startPolling('custom');
      toast.success('Custom domain saved — add the CNAME record shown below');
    } catch (error: any) {
      setCustomDomainStatus(null);
      toast.error(error.response?.data?.message || error.message || 'Failed to save custom domain');
    } finally {
      setKbSaving(false);
    }
  };

  const handleRemoveCustomDomain = async () => {
    if (!selectedOrgId) return;
    try {
      setKbSaving(true);
      if (pollingTypeRef.current === 'custom') stopPolling();
      const data = await updateKbSettings(selectedOrgId, { custom_domain: null });
      setKbSettings(data.settings);
      setCustomDomainInput('');
      setCustomDomainStatus(null);
      setLastProvision(null);
      toast.success('Custom domain removed');
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to remove custom domain');
    } finally {
      setKbSaving(false);
    }
  };

  const handleRetryAutoDomain = async () => {
    if (!selectedOrgId) return;
    setAutoDomainStatus('issuing');
    try {
      const result = await provisionDomain(selectedOrgId, 'wazzi');
      setLastProvision(result);
      setKbSettings(result.settings);
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
      const data = await updateKbSettings(selectedOrgId, {
        name: kbNameInput.trim() || null,
        custom_theme: customThemeInput.trim() || null,
      });
      setKbSettings(data.settings);
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

  const isKbEnabled = kbSettings?.is_enabled ?? false;
  const isKbLive    = isKbEnabled && autoDomainStatus === 'active';
  const displayName = kbSettings?.name || selectedOrgName;

  const cnameTarget =
    lastProvision?.cname_target ??
    kbSettings?.auto_domain_config?.dns?.provisioned_at
      ? kbSettings?.auto_domain_config?.dns?.record_id
      : null;

  const customDnsInstructions =
    lastProvision?.domain_type === 'custom' ? lastProvision.dns_instructions : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Knowledge Base</h1>
        <p className="text-muted-foreground">Manage Knowledge Base settings for {displayName}</p>
      </div>

      {kbLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !isKbEnabled ? (

        /* ── Disabled state ───────────────────────────────────────────────── */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Knowledge Base is disabled</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Enable the Knowledge Base to provision a self-service portal for {selectedOrgName}.
            </p>
            <Button onClick={() => handleKbToggle(true)} disabled={kbSaving}>
              {kbSaving ? 'Enabling…' : 'Enable Knowledge Base'}
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
              onClick={() => handleKbToggle(false)}
              disabled={kbSaving}
            >
              Disable
            </Button>
          </div>

          {/* ── Settings Tab ─────────────────────────────────────────────── */}
          <TabsContent value="settings" className="mt-6 space-y-6">

            {/* Live status alert */}
            {isKbLive && kbSettings && (
              <Alert>
                <BookOpen className="h-4 w-4" />
                <AlertDescription className="flex flex-wrap items-center gap-x-1">
                  Your Knowledge Base is live at{' '}
                  <a href={`https://${kbSettings.auto_domain}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                    {kbSettings.auto_domain}
                  </a>
                  {customDomainStatus === 'active' && kbSettings.custom_domain && (
                    <>
                      {' '}and{' '}
                      <a href={`https://${kbSettings.custom_domain}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                        {kbSettings.custom_domain}
                      </a>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Portals */}
            <Card>
              <CardHeader>
                <CardTitle>Portals</CardTitle>
                <CardDescription>Choose which portals are active for this Knowledge Base.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {([
                  { key: 'vendor_enabled'   as const, label: 'Vendor',         description: 'For vendors and suppliers (public, no-index)' },
                  { key: 'internal_enabled' as const, label: 'Internal',       description: 'For internal staff only (authenticated)' },
                  { key: 'owner_enabled'    as const, label: 'Owner Partners', description: 'For owner/partner access (public, no-index)' },
                  { key: 'guest_enabled'    as const, label: 'Guest',          description: 'For public visitors (indexed by search engines)' },
                ] as const).map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label className="font-medium">{label}</Label>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <Switch
                      checked={kbSettings?.[key] ?? false}
                      disabled={kbSaving}
                      onCheckedChange={async (enabled) => {
                        if (!selectedOrgId) return;
                        try {
                          setKbSaving(true);
                          const data = await updateKbSettings(selectedOrgId, { [key]: enabled });
                          setKbSettings(data.settings);
                        } catch (error: any) {
                          toast.error(error.response?.data?.message || error.message || 'Failed to update portal');
                        } finally { setKbSaving(false); }
                      }}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Domain Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Domain Configuration</CardTitle>
                <CardDescription>
                  Your assigned domain is always available. Optionally add a custom domain — both will be served simultaneously.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Assigned domain */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">Assigned Domain</Label>
                    <DomainStatusBadge status={autoDomainStatus} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Auto-generated from your organization slug. Always available — cannot be removed.
                  </p>
                  {kbSettings && (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 items-center rounded-md border bg-muted px-3 py-2 text-sm font-mono">
                        <Globe className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {kbSettings.auto_domain}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(kbSettings.auto_domain)}>
                        {copiedDomain === kbSettings.auto_domain ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`https://${kbSettings.auto_domain}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  )}

                  {autoDomainStatus === 'verifying' && (
                    <p className="text-xs text-muted-foreground">
                      DNS provisioned. Checking if the domain is reachable — rechecking every 30 seconds.
                      This typically takes 1–5 minutes.
                    </p>
                  )}
                  {autoDomainStatus === 'failed' && (
                    <p className="text-xs text-destructive">
                      Domain could not be verified after 30 minutes. Check your DNS / Cloudflare configuration and{' '}
                      <button className="underline" onClick={handleRetryAutoDomain}>try again</button>.
                    </p>
                  )}
                  {cnameTarget && autoDomainStatus !== 'active' && kbSettings && (
                    <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                      CNAME: {kbSettings.auto_domain} → {cnameTarget}
                    </div>
                  )}
                </div>

                {/* Custom domain */}
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">Custom Domain</Label>
                    <DomainStatusBadge status={customDomainStatus} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter your own domain (e.g. <code>help.yourcompany.com</code>). After saving, add the CNAME record shown below at your DNS provider.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="help.yourcompany.com"
                      value={customDomainInput}
                      onChange={(e) => setCustomDomainInput(e.target.value.toLowerCase().replace(/^https?:\/\//, ''))}
                      className="font-mono text-sm"
                    />
                    <Button
                      onClick={handleSaveCustomDomain}
                      disabled={kbSaving || !customDomainInput.trim() || customDomainInput.trim() === kbSettings?.custom_domain}
                    >
                      {kbSaving ? 'Saving…' : kbSettings?.custom_domain ? 'Update' : 'Save'}
                    </Button>
                    {kbSettings?.custom_domain && (
                      <Button variant="destructive" onClick={handleRemoveCustomDomain} disabled={kbSaving}>
                        Remove
                      </Button>
                    )}
                  </div>

                  {/* DNS record instructions */}
                  {kbSettings?.custom_domain && customDnsInstructions && (
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

            {/* KB Name */}
            <Card>
              <CardHeader>
                <CardTitle>Knowledge Base Name</CardTitle>
                <CardDescription>
                  Set a display name shown to visitors of your Knowledge Base portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="kb-name">Name</Label>
                  <Input
                    id="kb-name"
                    placeholder={selectedOrgName || 'Knowledge Base'}
                    value={kbNameInput}
                    onChange={(e) => setKbNameInput(e.target.value)}
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
                <CardDescription>
                  Upload a logo to display on your Knowledge Base portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                {logoLoading || (logoUrlFromApi && !logoUrl) ? (
                  <div className="flex items-center gap-4 h-16">
                    <div className="h-16 w-[200px] rounded border bg-muted animate-pulse" />
                    <div className="text-sm text-muted-foreground">Loading logo...</div>
                  </div>
                ) : logoUrl ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={logoUrl}
                      alt="KB Logo"
                      className="h-16 max-w-[200px] object-contain rounded border p-2 bg-white"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLogoDelete}
                      disabled={logoDeleting}
                    >
                      {logoDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => !logoUploading && logoInputRef.current?.click()}
                  >
                    {logoUploading
                      ? <Loader2 className="h-8 w-8 text-muted-foreground mb-2 animate-spin" />
                      : <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    }
                    <p className="text-sm font-medium">{logoUploading ? 'Uploading…' : 'Upload logo'}</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG or SVG — max 2 MB</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      disabled={logoUploading}
                      onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click(); }}
                    >
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
                  Override CSS variables to brand the public portal. Changes apply globally across all portal pages.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Variable reference toggle */}
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
                      {KB_CSS_VARIABLES.map(({ name, description }) => (
                        <div key={name} className="flex items-baseline gap-2 min-w-0">
                          <code className="shrink-0 text-xs font-mono text-primary">{name}</code>
                          <span className="truncate text-xs text-muted-foreground">{description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Code editor */}
                <div className="rounded-lg overflow-hidden border">
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#1a2332] border-b border-slate-200 dark:border-[#2a3a4e] px-3 py-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                    <span className="ml-2 text-xs text-slate-400 dark:text-[#8a9bb0] font-mono">custom-theme.css</span>
                    <button
                      type="button"
                      onClick={() => setCustomThemeInput(KB_THEME_DEFAULTS)}
                      className="ml-auto text-xs text-slate-400 dark:text-[#8a9bb0] hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
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
                      'leading-relaxed tracking-wide'
                    )}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Leave empty to use the default theme.
                </p>
              </CardContent>
            </Card>

            {/* Combined save */}
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
