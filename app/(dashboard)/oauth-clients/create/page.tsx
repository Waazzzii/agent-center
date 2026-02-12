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
import { ArrowLeft, AlertTriangle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateOAuthClientPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [formData, setFormData] = useState({
    client_id: '',
    client_name: '',
    organization_id: '',
  });
  const [redirectUriText, setRedirectUriText] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    client_id: string;
    client_secret: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<'id' | 'secret' | null>(null);

  useEffect(() => {
    if (!admin || !isSuperAdmin()) {
      router.push('/users');
      return;
    }

    loadOrganizations();
  }, [admin]);

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
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    setFormData({ ...formData, client_id: uuid });
  };

  const handleCopy = async (text: string, field: 'id' | 'secret') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast.success('Copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.client_id || !formData.client_name || !formData.organization_id) {
      toast.error('Client ID, name, and organization are required');
      return;
    }

    const redirectUri = redirectUriText.trim();

    if (!redirectUri) {
      toast.error('Redirect URI is required');
      return;
    }

    try {
      setLoading(true);
      const response = await createOAuthClient({
        client_id: formData.client_id,
        client_name: formData.client_name,
        organization_id: formData.organization_id,
        redirect_uri: redirectUri,
      });

      // Store credentials to show in modal
      setCreatedCredentials({
        client_id: formData.client_id,
        client_secret: (response as any).client_secret || 'AUTO_GENERATED_SECRET',
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

  if (!admin || !isSuperAdmin()) {
    return null;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create OAuth Client</h1>
          <p className="text-muted-foreground">Add a new OAuth 2.0 client for backend integration (Claude to Wazzi)</p>
        </div>
      </div>

      <Alert variant="destructive" className="mb-6 max-w-2xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Warning: Client Secret Security</AlertTitle>
        <AlertDescription>
          The client secret will only be shown ONCE after creation. Make sure to copy and save it securely.
          You will not be able to retrieve it later.
        </AlertDescription>
      </Alert>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>OAuth Client Details</CardTitle>
          <CardDescription>
            Create OAuth clients for backend services and Claude integrations. These credentials should be kept secure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client_id">Client ID *</Label>
                <div className="flex gap-2">
                  <Input
                    id="client_id"
                    value={formData.client_id}
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                    required
                    placeholder="Click 'Generate Client ID' to create a UUID"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={generateClientId}>
                    Generate Client ID
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  A unique identifier for this OAuth client
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_name">Name *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  required
                  placeholder="e.g., Claude Backend Integration"
                />
                <p className="text-sm text-muted-foreground">
                  A descriptive name for this OAuth client
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization_id">Organization *</Label>
                <Select
                  value={formData.organization_id}
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
                  The allowed callback URL for OAuth flow.
                </p>
              </div>

              <div className="rounded-lg border border-muted bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> The client secret will be auto-generated securely on the server when you submit this form.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create OAuth Client'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showSuccessModal} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>OAuth Client Created Successfully</DialogTitle>
            <DialogDescription>
              Save these credentials securely. The client secret will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="modal-client-id">Client ID</Label>
              <div className="flex gap-2">
                <Input
                  id="modal-client-id"
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
                  {copiedField === 'id' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="modal-client-secret">Client Secret</Label>
              <div className="flex gap-2">
                <Input
                  id="modal-client-secret"
                  value={createdCredentials?.client_secret || ''}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(createdCredentials?.client_secret || '', 'secret')}
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
                This is the only time the client secret will be displayed. Make sure to copy and save it now.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleModalClose}>
              I've Saved the Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
