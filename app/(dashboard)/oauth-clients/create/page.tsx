'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { createOAuthClient } from '@/lib/api/oauth-clients';
import { getOrganizations } from '@/lib/api/organizations';
import { Organization } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, AlertTriangle, Copy, Check, Plug, Layout } from 'lucide-react';
import { toast } from 'sonner';

type ClientType = 'connector' | 'platform';

const CONNECTOR_DEFAULT_TTL = 604800; // 7 days
const PLATFORM_DEFAULT_TTL  = 86400;  // 24 hours

function ttlLabel(seconds: number): string {
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400} day${seconds / 86400 !== 1 ? 's' : ''}`;
  if (seconds >= 3600  && seconds % 3600  === 0) return `${seconds / 3600} hour${seconds / 3600 !== 1 ? 's' : ''}`;
  return `${seconds} seconds`;
}

export default function CreateOAuthClientPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [clientType, setClientType] = useState<ClientType>('connector');

  const [formData, setFormData] = useState({
    client_id: '',
    client_name: '',
    organization_id: '',
    redirect_uri: '',
    description: '',
    refresh_token_expiry_seconds: String(CONNECTOR_DEFAULT_TTL),
  });

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    client_id: string;
    client_secret?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<'id' | 'secret' | null>(null);

  useEffect(() => {
    if (!admin || !isSuperAdmin()) {
      router.push('/users');
      return;
    }
    loadOrganizations();
  }, [admin]);

  // When type changes, set the recommended default TTL
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      refresh_token_expiry_seconds: String(
        clientType === 'connector' ? CONNECTOR_DEFAULT_TTL : PLATFORM_DEFAULT_TTL
      ),
    }));
  }, [clientType]);

  const loadOrganizations = async () => {
    try {
      const data = await getOrganizations();
      setOrganizations(data.organizations);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load organizations');
    }
  };

  const generateClientId = () => {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    setFormData((f) => ({ ...f, client_id: uuid }));
  };

  const handleCopy = async (text: string, field: 'id' | 'secret') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.client_id || !formData.client_name) {
      toast.error('Client ID and name are required');
      return;
    }

    const ttlRaw = parseInt(formData.refresh_token_expiry_seconds, 10);
    if (isNaN(ttlRaw) || ttlRaw <= 0) {
      toast.error('Refresh token TTL must be a positive number of seconds');
      return;
    }

    try {
      setLoading(true);

      let response;
      if (clientType === 'connector') {
        if (!formData.organization_id) {
          toast.error('Organization is required for connector clients');
          setLoading(false);
          return;
        }
        if (!formData.redirect_uri.trim()) {
          toast.error('Redirect URI is required for connector clients');
          setLoading(false);
          return;
        }
        response = await createOAuthClient({
          client_id: formData.client_id,
          client_name: formData.client_name,
          organization_id: formData.organization_id,
          redirect_uri: formData.redirect_uri.trim(),
          is_public: false,
          description: formData.description.trim() || undefined,
          refresh_token_expiry_seconds: ttlRaw,
        });
      } else {
        response = await createOAuthClient({
          client_id: formData.client_id,
          client_name: formData.client_name,
          is_public: true,
          description: formData.description.trim() || undefined,
          refresh_token_expiry_seconds: ttlRaw,
        });
      }

      setCreatedCredentials({
        client_id: formData.client_id,
        client_secret: (response as any).client_secret,
      });
      setShowSuccessModal(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create OAuth client');
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    router.push('/oauth-clients');
  };

  if (!admin || !isSuperAdmin()) return null;

  const isConnector = clientType === 'connector';

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create OAuth Client</h1>
          <p className="text-muted-foreground">Add a new OAuth 2.0 client</p>
        </div>
      </div>

      {isConnector && (
        <Alert variant="destructive" className="mb-6 max-w-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Client Secret — save it now</AlertTitle>
          <AlertDescription>
            The client secret will only be shown once after creation.
            Copy and store it securely — you cannot retrieve it later.
          </AlertDescription>
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>OAuth Client Details</CardTitle>
          <CardDescription>
            Choose the client type then fill in the details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Client type ── */}
            <div className="space-y-3">
              <Label>Client Type *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setClientType('connector')}
                  className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors ${
                    isConnector ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Plug className="h-4 w-4" />
                    Connector
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Claude / MCP integrations. Confidential client with secret + PKCE. Scoped to an organization.
                    Recommended refresh token: <strong>7 days</strong>.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setClientType('platform')}
                  className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors ${
                    !isConnector ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Layout className="h-4 w-4" />
                    Platform
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Admin UI, KB Portal, or internal tools. Public client (PKCE only, no secret).
                    Redirect URI validated dynamically.
                    Recommended refresh token: <strong>24 hours</strong>.
                  </p>
                </button>
              </div>
            </div>

            {/* ── Common fields ── */}
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID *</Label>
              <div className="flex gap-2">
                <Input
                  id="client_id"
                  value={formData.client_id}
                  onChange={(e) => setFormData((f) => ({ ...f, client_id: e.target.value }))}
                  required
                  placeholder="Click Generate to create a UUID"
                  className="flex-1 font-mono text-sm"
                />
                <Button type="button" variant="outline" onClick={generateClientId}>
                  Generate
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_name">Name *</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData((f) => ({ ...f, client_name: e.target.value }))}
                required
                placeholder={isConnector ? 'e.g., Claude MCP – Acme Corp' : 'e.g., Admin UI'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                placeholder={
                  isConnector
                    ? 'e.g., Allows Claude to access Wazzi connectors for the Acme organization'
                    : 'e.g., Wazzi Admin Dashboard — public PKCE client'
                }
                rows={2}
              />
            </div>

            {/* ── Connector-only fields ── */}
            {isConnector && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="organization_id">Organization *</Label>
                  <Select
                    value={formData.organization_id}
                    onValueChange={(v) => setFormData((f) => ({ ...f, organization_id: v }))}
                    required
                  >
                    <SelectTrigger id="organization_id">
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="redirect_uri">Redirect URI *</Label>
                  <Input
                    id="redirect_uri"
                    value={formData.redirect_uri}
                    onChange={(e) => setFormData((f) => ({ ...f, redirect_uri: e.target.value }))}
                    placeholder="https://claude.ai/api/mcp/auth_callback"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    The OAuth callback URL — must exactly match what the client sends.
                  </p>
                </div>
              </>
            )}

            {!isConnector && (
              <div className="rounded-lg border border-muted bg-muted/50 p-3 text-sm text-muted-foreground">
                Platform clients use <strong>dynamic redirect URI validation</strong> — the backend
                accepts any <code>*.wazzi.io/callback</code> origin or localhost during development.
                No redirect URI needs to be stored.
              </div>
            )}

            {/* ── Refresh token TTL ── */}
            <div className="space-y-2">
              <Label htmlFor="refresh_ttl">Refresh Token TTL (seconds) *</Label>
              <Input
                id="refresh_ttl"
                type="number"
                min={60}
                value={formData.refresh_token_expiry_seconds}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, refresh_token_expiry_seconds: e.target.value }))
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const v = parseInt(formData.refresh_token_expiry_seconds, 10);
                  if (isNaN(v) || v <= 0) return 'Enter a positive number of seconds.';
                  return (
                    <>
                      {ttlLabel(v)} — rotated on every use; TTL resets on each access token refresh.{' '}
                      {isConnector
                        ? 'Recommended: 604800 (7 days) — allows idle Claude sessions to persist across the week.'
                        : 'Recommended: 86400 (24 hours) — users must re-authenticate after a day of inactivity.'}
                    </>
                  );
                })()}
              </p>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating…' : 'Create OAuth Client'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Success modal ── */}
      <Dialog open={showSuccessModal} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>OAuth Client Created</DialogTitle>
            <DialogDescription>
              {createdCredentials?.client_secret
                ? 'Save these credentials securely. The client secret will not be shown again.'
                : 'Platform client created — no secret to save (public / PKCE only).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client ID</Label>
              <div className="flex gap-2">
                <Input
                  value={createdCredentials?.client_id || ''}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(createdCredentials?.client_id || '', 'id')}
                >
                  {copiedField === 'id' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {createdCredentials?.client_secret && (
              <>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <div className="flex gap-2">
                    <Input
                      value={createdCredentials.client_secret}
                      readOnly
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(createdCredentials!.client_secret!, 'secret')}
                    >
                      {copiedField === 'secret' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This is the only time the client secret is displayed. Copy it now.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleModalClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
