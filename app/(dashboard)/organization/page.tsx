'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useAuthStore } from '@/stores/auth.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { usePermission } from '@/lib/hooks/use-permission';
import { getOrganization, updateOrganization } from '@/lib/api/organizations';
import { Organization } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AlertCircle } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SettingsPage() {
  const router = useRouter();
  const { selectedOrgId, selectedOrgName, isOrgAdminView } = useAdminViewStore();
  const { isSuperAdmin } = useAuthStore();
  const permitted = useRequirePermission('organization_read');
  const canUpdate = usePermission('organization_update');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [formData, setFormData] = useState<Partial<Organization>>({});

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      router.push('/organizations');
      return;
    }
    loadOrganization();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, isOrgAdminView]);

  const loadOrganization = async () => {
    if (!selectedOrgId) return;
    try {
      setInitialLoading(true);
      const data = await getOrganization(selectedOrgId);
      setOrganization(data);
      setFormData(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load organization settings');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) { toast.error('Organization name is required'); return; }
    if (!selectedOrgId) return;

    try {
      setLoading(true);
      await updateOrganization(selectedOrgId, {
        name: formData.name,
        description: formData.description,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,
        website: formData.website,
        address_line1: formData.address_line1,
        address_line2: formData.address_line2,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        country: formData.country,
        ...(isSuperAdmin() ? { is_active: formData.is_active } : {}),
      });
      toast.success('Organization settings updated successfully');
      await loadOrganization();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update organization settings');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!permitted) return <NoPermissionContent />;

  if (!organization) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load organization settings. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage settings for {selectedOrgName}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Update your organization's basic information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name *</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Corporation"
                disabled={!canUpdate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={formData.slug || ''}
                disabled
                className="bg-muted cursor-not-allowed font-mono"
              />
              <p className="text-xs text-muted-foreground">
                The slug is set at creation and cannot be changed
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of your organization..."
              rows={3}
              disabled={!canUpdate}
            />
          </div>

          {isSuperAdmin() && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is_active">Active Status</Label>
                <p className="text-sm text-muted-foreground">Organization is active and accessible</p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active || false}
                disabled={!canUpdate}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Primary contact details for this organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email || ''}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="contact@example.com"
                disabled={!canUpdate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input
                id="contact_phone"
                type="tel"
                value={formData.contact_phone || ''}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                disabled={!canUpdate}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={formData.website || ''}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://example.com"
              disabled={!canUpdate}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>Physical address for this organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address_line1">Address Line 1</Label>
            <Input
              id="address_line1"
              value={formData.address_line1 || ''}
              onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
              placeholder="123 Main Street"
              disabled={!canUpdate}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_line2">Address Line 2</Label>
            <Input
              id="address_line2"
              value={formData.address_line2 || ''}
              onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
              placeholder="Suite 100"
              disabled={!canUpdate}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city || ''}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="San Francisco"
                disabled={!canUpdate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                value={formData.state || ''}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="CA"
                disabled={!canUpdate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">Postal Code</Label>
              <Input
                id="postal_code"
                value={formData.postal_code || ''}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="94102"
                disabled={!canUpdate}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={formData.country || ''}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              placeholder="United States"
              disabled={!canUpdate}
            />
          </div>
          <div className="flex gap-4 pt-2">
            <Button onClick={handleSubmit} disabled={loading || !canUpdate}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button type="button" variant="outline" onClick={loadOrganization} disabled={!canUpdate}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
