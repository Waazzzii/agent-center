'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getCenterSettings, updateCenterSettings } from '@/lib/api/center-settings';
import { getKbSettings, updateKbSettings } from '@/lib/api/kb-settings';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Globe, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface ProductRow {
  key: 'administration' | 'knowledge_base';
  label: string;
  description: string;
  icon: React.ElementType;
  editHref: string;
  isEnabled: boolean;
  permissionKey: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const { selectedOrgId, selectedOrgName, isOrgAdminView } = useAdminViewStore();
  const permitted = useRequirePermission('admin_products');

  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) { router.push('/organizations'); return; }
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadProducts = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [centerResult, kbResult] = await Promise.allSettled([
        getCenterSettings(selectedOrgId),
        getKbSettings(selectedOrgId),
      ]);

      const rows: ProductRow[] = [];

      if (centerResult.status === 'fulfilled') {
        rows.push({
          key: 'administration',
          label: 'Administration',
          description: 'Customer-facing administration portal with custom domain, branding, and theme.',
          icon: Globe,
          editHref: '/centers/admin',
          isEnabled: centerResult.value.settings.is_enabled,
          permissionKey: 'center_admin',
        });
      }

      if (kbResult.status === 'fulfilled') {
        rows.push({
          key: 'knowledge_base',
          label: 'Knowledge Base',
          description: 'Self-service knowledge base portal for your customers with custom domain and branding.',
          icon: BookOpen,
          editHref: '/knowledge-base',
          isEnabled: kbResult.value.settings.is_enabled,
          permissionKey: 'knowledgebase_admin_read',
        });
      }

      setProducts(rows);
    } catch (err) {
      toast.error('Failed to load products');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (productKey: string, enabled: boolean) => {
    if (!selectedOrgId) return;
    setToggling(productKey);
    try {
      if (productKey === 'administration') {
        await updateCenterSettings(selectedOrgId, { is_enabled: enabled });
      } else {
        await updateKbSettings(selectedOrgId, { is_enabled: enabled });
      }
      setProducts((prev) =>
        prev.map((p) => (p.key === productKey ? { ...p, isEnabled: enabled } : p))
      );
      toast.success(`${productKey === 'administration' ? 'Administration' : 'Knowledge Base'} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to update product');
    } finally {
      setToggling(null);
    }
  };

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Products</h1>
        <p className="text-muted-foreground">
          Manage Centers products available to {selectedOrgName}.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Available Products</CardTitle>
            <CardDescription>
              Enable or disable products and configure their settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {products.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No products available.</p>
            ) : (
              <div className="divide-y">
                {products.map((product) => {
                  const Icon = product.icon;
                  const isToggling = toggling === product.key;

                  return (
                    <div key={product.key} className="flex items-center gap-4 px-6 py-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{product.label}</p>
                          <Badge
                            variant={product.isEnabled ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {product.isEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{product.description}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isToggling ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Switch
                            checked={product.isEnabled}
                            onCheckedChange={(checked) => handleToggle(product.key, checked)}
                            disabled={isToggling}
                          />
                        )}
                        <Button variant="outline" size="sm" asChild>
                          <Link href={product.editHref}>
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Edit
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
