'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getOrganizations } from '@/lib/api/organizations';
import type { Organization } from '@/types/api.types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function OrganizationSelector() {
  const { admin } = useAuthStore();
  const { selectedOrgId, switchToOrgAdminView } = useAdminViewStore();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrganizations() {
      if (!admin) return;

      try {
        setLoading(true);
        const { organizations: allOrgs } = await getOrganizations();

        // Filter organizations based on admin's assigned organizations
        // Super admins see all orgs, org admins only see assigned orgs
        const filteredOrgs = admin.role === 'super_admin'
          ? allOrgs
          : allOrgs.filter(org => admin.assignedOrganizations.includes(org.id));

        setOrganizations(filteredOrgs);
      } catch (error) {
        console.error('Failed to load organizations:', error);
      } finally {
        setLoading(false);
      }
    }

    loadOrganizations();
  }, [admin]);

  // Don't show if no orgs or only one org
  if (loading || organizations.length <= 1) {
    return null;
  }

  const handleOrgChange = (orgId: string) => {
    const selectedOrg = organizations.find(org => org.id === orgId);
    if (selectedOrg) {
      switchToOrgAdminView(selectedOrg.id, selectedOrg.name);
      // Trigger a page refresh to reload data for the new organization
      window.location.reload();
    }
  };

  const currentOrg = organizations.find(org => org.id === selectedOrgId);

  return (
    <div className="px-3 pb-2">
      <Select value={selectedOrgId || undefined} onValueChange={handleOrgChange}>
        <SelectTrigger className="w-full" size="sm">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0" />
            <SelectValue placeholder="Select organization">
              {currentOrg ? (
                <span className="truncate">{currentOrg.name}</span>
              ) : (
                'Select organization'
              )}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              <span className="truncate">{org.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
