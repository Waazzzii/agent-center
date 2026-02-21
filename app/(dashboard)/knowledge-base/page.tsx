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
import type { KbOrgSettings, DomainProvisioningStatus, ProvisionDomainResult } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Copy, Check, Globe, ExternalLink, AlertCircle, Settings, Palette, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;      // 30 seconds between reachability checks
const MAX_VERIFY_MS    = 30 * 60_000; // 30 minutes before declaring failure

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
  const [kbLoading, setKbLoading]   = useState(false);
  const [kbSaving, setKbSaving]     = useState(false);
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [copiedDomain, setCopiedDomain]           = useState<string | null>(null);

  // Theme tab state
  const [kbNameInput, setKbNameInput]   = useState('');
  const [kbNameSaving, setKbNameSaving] = useState(false);

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

  const loadKbSettings = async () => {
    if (!selectedOrgId) return;
    try {
      setKbLoading(true);
      const data = await getKbSettings(selectedOrgId);
      setKbSettings(data.settings);
      setCustomDomainInput(data.settings.custom_domain || '');
      setKbNameInput(data.settings.name || '');

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
      if (enabled && data.settings.name) setKbNameInput(data.settings.name);

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

  const handleSaveName = async () => {
    if (!selectedOrgId) return;
    try {
      setKbNameSaving(true);
      const data = await updateKbSettings(selectedOrgId, { name: kbNameInput.trim() || null });
      setKbSettings(data.settings);
      toast.success('Knowledge Base name saved');
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to save name');
    } finally {
      setKbNameSaving(false);
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
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="kb-name">Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="kb-name"
                      placeholder={selectedOrgName || 'Knowledge Base'}
                      value={kbNameInput}
                      onChange={(e) => setKbNameInput(e.target.value)}
                    />
                    <Button
                      onClick={handleSaveName}
                      disabled={kbNameSaving || kbNameInput === (kbSettings?.name ?? '')}
                    >
                      {kbNameSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
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
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Upload logo</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG or SVG — max 2 MB</p>
                  <Button variant="outline" size="sm" className="mt-4" disabled>
                    Choose file
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Styling */}
            <Card>
              <CardHeader>
                <CardTitle>Styling</CardTitle>
                <CardDescription>
                  Customize the look and feel of your Knowledge Base.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Palette className="h-12 w-12 text-muted-foreground mb-3" />
                  <h3 className="text-base font-semibold">Coming soon</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Custom colors, fonts, and layout options will be available here.
                  </p>
                </div>
              </CardContent>
            </Card>

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
