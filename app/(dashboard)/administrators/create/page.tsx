'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { createAdministrator } from '@/lib/api/administrators';
import { getOrganizations } from '@/lib/api/organizations';
import { Organization } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateAdministratorPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [formData, setFormData] = useState({
    email: '',
    role: 'org_admin' as 'super_admin' | 'org_admin',
    assigned_organizations: [] as string[],
  });
  const [validationError, setValidationError] = useState<string | null>(null);

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

  const handleOrganizationToggle = (orgId: string, checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        assigned_organizations: [...formData.assigned_organizations, orgId],
      });
    } else {
      setFormData({
        ...formData,
        assigned_organizations: formData.assigned_organizations.filter(id => id !== orgId),
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

    if (formData.role === 'org_admin' && formData.assigned_organizations.length === 0) {
      const errorMsg = 'Please select at least one organization for org admin';
      setValidationError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    try {
      setLoading(true);
      await createAdministrator({
        email: formData.email,
        role: formData.role,
        assigned_organizations: formData.role === 'super_admin' ? [] : formData.assigned_organizations,
      });
      toast.success('Administrator created successfully');
      router.push('/administrators');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create administrator');
    } finally {
      setLoading(false);
    }
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
          <h1 className="text-3xl font-bold">Create Administrator</h1>
          <p className="text-muted-foreground">Add a new administrator user</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Administrator Details</CardTitle>
          <CardDescription>Enter the information for the new administrator</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
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
                    setFormData({ ...formData, role: value, assigned_organizations: [] })
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
                  <Card className={validationError && formData.assigned_organizations.length === 0 ? 'border-destructive' : ''}>
                    <CardContent className="pt-6">
                      {organizations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No organizations available</p>
                      ) : (
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {organizations.map((org) => (
                            <div key={org.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`org-${org.id}`}
                                checked={formData.assigned_organizations.includes(org.id)}
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
                  {validationError && formData.assigned_organizations.length === 0 ? (
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
                {loading ? 'Creating...' : 'Create Administrator'}
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
