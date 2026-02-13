'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { createConnector } from '@/lib/api/connectors-base';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectorSchemaBuilder } from '@/components/connector-schema-builder';
import { ConnectorConfigSchema } from '@/types/api.types';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateConnectorPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    description: '',
    icon_url: '',
    documentation_url: '',
    available_endpoints: [] as string[],
    configuration_schema: undefined as ConnectorConfigSchema | undefined,
    is_active: true,
    is_public: false,
  });
  const [endpointsText, setEndpointsText] = useState('');

  if (!admin || !isSuperAdmin()) {
    router.push('/users');
    return null;
  }

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
      await createConnector({ ...formData, available_endpoints: endpoints });
      toast.success('Connector created successfully');
      router.push('/connectors-catalog');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create connector');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Connector</h1>
          <p className="text-muted-foreground">Add a new connector to the catalog</p>
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
                <CardDescription>Enter the information for the new connector</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="key">Key *</Label>
                      <Input
                        id="key"
                        value={formData.key}
                        onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                        required
                        placeholder="google-drive"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
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
                      value={formData.description}
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
                      value={formData.icon_url}
                      onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                      placeholder="https://example.com/icon.png"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="documentation_url">Documentation URL</Label>
                    <Input
                      id="documentation_url"
                      type="url"
                      value={formData.documentation_url}
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
                      checked={formData.is_active}
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
                      checked={formData.is_public}
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
            {loading ? 'Creating...' : 'Create Connector'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
