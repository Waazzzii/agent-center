'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useAuthStore } from '@/stores/auth.store';
import { getOrganization, updateOrganization } from '@/lib/api/organizations';
import { Organization } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings as SettingsIcon, Building2, CreditCard, BarChart3, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SettingsPage() {
  const router = useRouter();
  const { selectedOrgId, selectedOrgName, isOrgAdminView } = useAdminViewStore();
  const { isSuperAdmin } = useAuthStore();
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

  const handleSlugChange = (value: string) => {
    // Enforce slug format
    const cleanSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
    setFormData({ ...formData, slug: cleanSlug });
  };

  const validateSlug = (slug: string): boolean => {
    const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    return slugRegex.test(slug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error('Organization name is required');
      return;
    }

    if (!formData.slug) {
      toast.error('Slug is required');
      return;
    }

    if (!validateSlug(formData.slug)) {
      toast.error('Slug must contain only lowercase letters, numbers, and hyphens');
      return;
    }

    if (!selectedOrgId) return;

    try {
      setLoading(true);
      await updateOrganization(selectedOrgId, {
        name: formData.name,
        slug: formData.slug,
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
        is_active: formData.is_active,
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
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load organization settings. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage settings for {selectedOrgName}
          </p>
        </div>
      </div>

      <Tabs defaultValue="organization" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="organization">
            <Building2 className="h-4 w-4 mr-2" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="usage">
            <BarChart3 className="h-4 w-4 mr-2" />
            Usage Reports
          </TabsTrigger>
        </TabsList>

        {/* Organization Settings Tab */}
        <TabsContent value="organization" className="mt-6">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>
                  Update your organization's basic information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Organization Name *</Label>
                    <Input
                      id="name"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Acme Corporation"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug *</Label>
                    <Input
                      id="slug"
                      value={formData.slug || ''}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      required
                      placeholder="acme-corp"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL-friendly identifier (lowercase letters, numbers, and hyphens only)
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
                  />
                </div>

                {/* Only show Active Status toggle to super admins */}
                {isSuperAdmin() && (
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_active">Active Status</Label>
                      <p className="text-sm text-muted-foreground">
                        Organization is active and accessible
                      </p>
                    </div>
                    <Switch
                      id="is_active"
                      checked={formData.is_active || false}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>
                  Primary contact details for this organization
                </CardDescription>
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
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Address</CardTitle>
                <CardDescription>
                  Physical address for this organization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address_line1">Address Line 1</Label>
                  <Input
                    id="address_line1"
                    value={formData.address_line1 || ''}
                    onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                    placeholder="123 Main Street"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address_line2">Address Line 2</Label>
                  <Input
                    id="address_line2"
                    value={formData.address_line2 || ''}
                    onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                    placeholder="Suite 100"
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
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State/Province</Label>
                    <Input
                      id="state"
                      value={formData.state || ''}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="CA"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={formData.postal_code || ''}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      placeholder="94102"
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
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={loadOrganization}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
        </TabsContent>

        {/* Billing Tab - Placeholder */}
        <TabsContent value="billing" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Billing & Subscription</CardTitle>
              <CardDescription>
                Manage your organization's billing and subscription details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Billing Management</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-6">
                  Billing features are coming soon. You'll be able to view your subscription plan,
                  payment methods, invoices, and usage-based billing details here.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">Current Plan</h4>
                    <p className="text-xs text-muted-foreground">View and upgrade your subscription</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">Payment Methods</h4>
                    <p className="text-xs text-muted-foreground">Manage credit cards and billing info</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">Invoices</h4>
                    <p className="text-xs text-muted-foreground">Download past invoices and receipts</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Reports Tab - Placeholder */}
        <TabsContent value="usage" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Usage Reports & Analytics</CardTitle>
              <CardDescription>
                Monitor API usage, connector activity, and user statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Usage Analytics</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-6">
                  Usage reporting features are coming soon. You'll be able to view detailed analytics
                  on API calls, connector usage, active users, and data transfer metrics.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">API Calls</h4>
                    <p className="text-xs text-muted-foreground">Total requests per period</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">Active Users</h4>
                    <p className="text-xs text-muted-foreground">Monthly and daily active users</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">Connector Usage</h4>
                    <p className="text-xs text-muted-foreground">Usage by connector type</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">Data Transfer</h4>
                    <p className="text-xs text-muted-foreground">Bandwidth and storage metrics</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
