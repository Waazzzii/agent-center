'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { getConnector, updateConnector } from '@/lib/api/connectors-base';
import { Connector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectorSchemaBuilder } from '@/components/connector-schema-builder';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function EditConnectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectorId } = use(params);
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<Connector>>({});
  const [endpointsText, setEndpointsText] = useState('');

  useEffect(() => {
    if (!admin || !isSuperAdmin()) {
      router.push('/users');
      return;
    }

    loadConnector();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, connectorId]);

  const loadConnector = async () => {
    try {
      setInitialLoading(true);
      const data = await getConnector(connectorId);
      setFormData(data);
      setEndpointsText((data.available_endpoints || []).join('\n'));
    } catch (error: any) {
      toast.error(error.message || 'Failed to load connector');
      router.push('/connectors-catalog');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.key || !formData.name) {
      toast.error('Key and name are required');
      return;
    }

    const endpoints = endpointsText
      .split('\n')
      .map(e => e.trim())
      .filter(e => e.length > 0);

    try {
      setLoading(true);
      await updateConnector(connectorId, { ...formData, available_endpoints: endpoints });
      toast.success('Connector updated successfully');
      router.push('/connectors-catalog');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update connector');
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
          <h1 className="text-3xl font-bold">Edit Connector</h1>
          <p className="text-muted-foreground">Update connector details</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList>
            <TabsTrigger value="basic">Basic Details</TabsTrigger>
            <TabsTrigger value="schema">Custom Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-6">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>Connector Details</CardTitle>
                <CardDescription>Update the information for this connector</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="key">Key *</Label>
                      <Input
                        id="key"
                        value={formData.key || ''}
                        onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                        required
                        placeholder="google-drive"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="Google Drive"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of the connector"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="icon_url">Icon URL</Label>
                    <Input
                      id="icon_url"
                      type="url"
                      value={formData.icon_url || ''}
                      onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                      placeholder="https://example.com/icon.png"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="documentation_url">Documentation URL</Label>
                    <Input
                      id="documentation_url"
                      type="url"
                      value={formData.documentation_url || ''}
                      onChange={(e) => setFormData({ ...formData, documentation_url: e.target.value })}
                      placeholder="https://docs.example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="endpoints">Available Endpoints (one per line)</Label>
                    <Textarea
                      id="endpoints"
                      value={endpointsText}
                      onChange={(e) => setEndpointsText(e.target.value)}
                      placeholder="/files/list&#10;/files/upload&#10;/files/download"
                      rows={5}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_active">Active</Label>
                      <div className="text-sm text-muted-foreground">
                        Enable this connector
                      </div>
                    </div>
                    <Switch
                      id="is_active"
                      checked={formData.is_active || false}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_public">Public</Label>
                      <div className="text-sm text-muted-foreground">
                        Make this connector available to all organizations
                      </div>
                    </div>
                    <Switch
                      id="is_public"
                      checked={formData.is_public || false}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_public: checked })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schema" className="mt-6">
            <Card className="max-w-full">
              <CardHeader>
                <CardTitle>Configuration Schema</CardTitle>
                <CardDescription>
                  Define custom fields that organizations will fill when configuring this connector
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConnectorSchemaBuilder
                  initialSchema={formData.configuration_schema}
                  onChange={(schema) => setFormData({ ...formData, configuration_schema: schema })}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex gap-4">
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
