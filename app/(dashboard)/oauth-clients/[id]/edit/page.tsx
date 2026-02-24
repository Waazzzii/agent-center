'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { getOAuthClient, updateOAuthClient } from '@/lib/api/oauth-clients';
import { getOrganizations } from '@/lib/api/organizations';
import { OAuthClient, Organization } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Layout, Plug } from 'lucide-react';
import { toast } from 'sonner';

function ttlLabel(seconds: number): string {
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
  return `${seconds}s`;
}

export default function EditOAuthClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = use(params);
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [client, setClient] = useState<OAuthClient | null>(null);

  const [formData, setFormData] = useState({
    client_name: '',
    organization_id: '',
    redirect_uri: '',
    description: '',
    refresh_token_expiry_seconds: '86400',
    is_active: true,
  });

  useEffect(() => {
    if (!admin || !isSuperAdmin()) {
      router.push('/users');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, clientId]);

  const loadData = async () => {
    try {
      setInitialLoading(true);
      const [clientData, orgsData] = await Promise.all([
        getOAuthClient(clientId),
        getOrganizations(),
      ]);
      setClient(clientData);
      setFormData({
        client_name: clientData.client_name || '',
        organization_id: clientData.organization_id || '',
        redirect_uri: clientData.redirect_uri || '',
        description: clientData.description || '',
        refresh_token_expiry_seconds: String(clientData.refresh_token_expiry_seconds ?? 86400),
        is_active: clientData.is_active,
      });
      setOrganizations(orgsData.organizations);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load OAuth client');
      router.push('/oauth-clients');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_name) {
      toast.error('Name is required');
      return;
    }

    const ttl = parseInt(formData.refresh_token_expiry_seconds, 10);
    if (isNaN(ttl) || ttl <= 0) {
      toast.error('Refresh token TTL must be a positive number');
      return;
    }

    try {
      setLoading(true);
      await updateOAuthClient(clientId, {
        client_name: formData.client_name,
        organization_id: formData.organization_id || undefined,
        redirect_uri: formData.redirect_uri || undefined,
        description: formData.description || undefined,
        refresh_token_expiry_seconds: ttl,
        is_active: formData.is_active,
      });
      toast.success('OAuth client updated successfully');
      router.push('/oauth-clients');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update OAuth client');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  const isConnector = !client?.is_public;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit OAuth Client</h1>
          <p className="text-muted-foreground">Update OAuth client details</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>OAuth Client Details</CardTitle>
            {isConnector ? (
              <Badge variant="outline" className="flex items-center gap-1">
                <Plug className="h-3 w-3" /> Connector
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Layout className="h-3 w-3" /> Platform
              </Badge>
            )}
          </div>
          <CardDescription>
            {isConnector
              ? 'Confidential client with secret + PKCE — used for Claude / MCP integrations.'
              : 'Public client (PKCE only) — used for Admin UI, KB Portal, or internal tools.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <Input id="client_id" value={client?.client_id || ''} disabled className="bg-muted font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Client ID cannot be changed</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_name">Name *</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData((f) => ({ ...f, client_name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is this client used for?"
                rows={2}
              />
            </div>

            {isConnector && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="organization_id">Organization *</Label>
                  <Select
                    value={formData.organization_id}
                    onValueChange={(v) => setFormData((f) => ({ ...f, organization_id: v }))}
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
                  <Label htmlFor="redirect_uri">Redirect URI</Label>
                  <Input
                    id="redirect_uri"
                    value={formData.redirect_uri}
                    onChange={(e) => setFormData((f) => ({ ...f, redirect_uri: e.target.value }))}
                    placeholder="https://claude.ai/api/mcp/auth_callback"
                  />
                </div>
              </>
            )}

            {!isConnector && (
              <div className="rounded-lg border border-muted bg-muted/50 p-3 text-sm text-muted-foreground">
                Platform clients use <strong>dynamic redirect URI validation</strong> —{' '}
                <code>*.wazzi.io/callback</code> and localhost are accepted automatically.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="refresh_ttl">Refresh Token TTL (seconds)</Label>
              <Input
                id="refresh_ttl"
                type="number"
                min={60}
                value={formData.refresh_token_expiry_seconds}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, refresh_token_expiry_seconds: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const v = parseInt(formData.refresh_token_expiry_seconds, 10);
                  if (isNaN(v) || v <= 0) return 'Enter a positive number of seconds.';
                  return `Currently: ${ttlLabel(v)} — ${
                    isConnector
                      ? 'recommended 604800 (7 days) for MCP/Claude clients'
                      : 'recommended 86400 (24 hours) for platform clients'
                  }`;
                })()}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active">Active</Label>
                <div className="text-sm text-muted-foreground">Enable or disable this client</div>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData((f) => ({ ...f, is_active: checked }))}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
