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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function EditOAuthClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = use(params);
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [formData, setFormData] = useState<Partial<OAuthClient>>({});
  const [redirectUriText, setRedirectUriText] = useState('');

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
      setFormData(clientData);
      setRedirectUriText(clientData.redirect_uri || '');
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

    if (!formData.client_name || !formData.organization_id) {
      toast.error('Name and organization are required');
      return;
    }

    const redirectUri = redirectUriText.trim();

    if (!redirectUri) {
      toast.error('Redirect URI is required');
      return;
    }

    try {
      setLoading(true);
      await updateOAuthClient(clientId, {
        client_name: formData.client_name,
        organization_id: formData.organization_id,
        redirect_uri: redirectUri,
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
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

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
          <CardTitle>OAuth Client Details</CardTitle>
          <CardDescription>Update the information for this OAuth client</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client_id">Client ID</Label>
                <Input
                  id="client_id"
                  value={formData.client_id || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-sm text-muted-foreground">
                  Client ID cannot be changed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_name">Name *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name || ''}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  required
                  placeholder="My Application"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization_id">Organization *</Label>
                <Select
                  value={formData.organization_id || ''}
                  onValueChange={(value) =>
                    setFormData({ ...formData, organization_id: value })
                  }
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
                <p className="text-sm text-muted-foreground">
                  Select an organization for this OAuth client
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="redirect_uri">Redirect URI *</Label>
                <Input
                  id="redirect_uri"
                  value={redirectUriText}
                  onChange={(e) => setRedirectUriText(e.target.value)}
                  placeholder="https://example.com/callback"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  The allowed callback URL for OAuth flow
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active">Active</Label>
                  <div className="text-sm text-muted-foreground">
                    Enable this OAuth client
                  </div>
                </div>
                <Switch
                  id="is_active"
                  checked={formData.is_active || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
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
