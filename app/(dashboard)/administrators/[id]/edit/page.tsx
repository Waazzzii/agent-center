'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { getAdministrator, updateAdministrator } from '@/lib/api/administrators';
import { getOrganizations } from '@/lib/api/organizations';
import { Administrator, Organization } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function EditAdministratorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: adminId } = use(params);
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [formData, setFormData] = useState<Partial<Administrator>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || !isSuperAdmin()) {
      router.push('/users');
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, adminId]);

  const loadData = async () => {
    try {
      setInitialLoading(true);
      const [adminData, orgsData] = await Promise.all([
        getAdministrator(adminId),
        getOrganizations(),
      ]);
      setFormData(adminData);
      setOrganizations(orgsData.organizations);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load administrator');
      router.push('/administrators');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleOrganizationToggle = (orgId: string, checked: boolean) => {
    const currentOrgs = formData.assigned_organizations || [];
    if (checked) {
      setFormData({
        ...formData,
        assigned_organizations: [...currentOrgs, orgId],
      });
    } else {
      setFormData({
        ...formData,
        assigned_organizations: currentOrgs.filter(id => id !== orgId),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!formData.email) {
      const errorMsg = 'Email is required';
      setValidationError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (formData.role === 'org_admin' && (!formData.assigned_organizations || formData.assigned_organizations.length === 0)) {
      const errorMsg = 'Please select at least one organization for org admin';
      setValidationError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    try {
      setLoading(true);
      await updateAdministrator(adminId, {
        email: formData.email,
        role: formData.role,
        assigned_organizations: formData.role === 'super_admin' ? [] : formData.assigned_organizations,
      });
      toast.success('Administrator updated successfully');
      router.push('/administrators');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update administrator');
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
          <h1 className="text-3xl font-bold">Edit Administrator</h1>
          <p className="text-muted-foreground">Update administrator details</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Administrator Details</CardTitle>
          <CardDescription>Update the information for this administrator</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="admin@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: 'super_admin' | 'org_admin') =>
                    setFormData({ ...formData, role: value, assigned_organizations: value === 'super_admin' ? [] : formData.assigned_organizations })
                  }
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="org_admin">Organization Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {formData.role === 'super_admin'
                    ? 'Full access to all features and organizations'
                    : 'Access limited to assigned organizations'}
                </p>
              </div>

              {formData.role === 'org_admin' && (
                <div className="space-y-2">
                  <Label>Assigned Organizations *</Label>
                  <Card className={validationError && (!formData.assigned_organizations || formData.assigned_organizations.length === 0) ? 'border-destructive' : ''}>
                    <CardContent className="pt-6">
                      {organizations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No organizations available</p>
                      ) : (
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {organizations.map((org) => (
                            <div key={org.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`org-${org.id}`}
                                checked={formData.assigned_organizations?.includes(org.id) || false}
                                onCheckedChange={(checked) => {
                                  handleOrganizationToggle(org.id, checked as boolean);
                                  setValidationError(null);
                                }}
                              />
                              <label
                                htmlFor={`org-${org.id}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              >
                                {org.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  {validationError && (!formData.assigned_organizations || formData.assigned_organizations.length === 0) ? (
                    <p className="text-sm text-destructive font-medium">{validationError}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select the organizations this admin will have access to
                    </p>
                  )}
                </div>
              )}
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
