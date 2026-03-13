'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { getConnector, updateConnector, getConnectorAccessDefinitions, putConnectorAccessDefinitions, syncConnectorAccessDefinitions } from '@/lib/api/connectors-base';
import type { ConnectorAccessDefinition } from '@/lib/api/connectors-base';
import { Connector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConnectorSchemaBuilder } from '@/components/connector-schema-builder';
import { ArrowLeft, RefreshCw, Save, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const CRUD_LABELS: Record<string, string> = {
  read: 'Read', create: 'Create', update: 'Update', delete: 'Delete',
};

// Loose keyword match on label text to suggest CRUD type.
// Runs after sync to catch cases where endpoint-name detection and label wording diverge.
function refineCrudFromLabel(label: string): 'create' | 'read' | 'update' | 'delete' | null {
  const l = label.toLowerCase();
  if (/\b(view|list|get|read|search|find|show|browse|fetch|query)\b/.test(l)) return 'read';
  if (/\b(create|add|new|insert|generate|post|submit|upload)\b/.test(l)) return 'create';
  if (/\b(update|edit|modify|change|set|patch|replace|rename)\b/.test(l)) return 'update';
  if (/\b(delete|remove|destroy|clear|purge|revoke)\b/.test(l)) return 'delete';
  return null;
}

// ─── Access Definitions Tab ─────────────────────────────────────────────────

function AccessDefinitionsTab({
  connectorId,
}: {
  connectorId: string;
}) {
  const [definitions, setDefinitions] = useState<ConnectorAccessDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getConnectorAccessDefinitions(connectorId);
      setDefinitions(data.definitions);
    } catch {
      toast.error('Failed to load access definitions');
    } finally {
      setLoading(false);
    }
  }, [connectorId]);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const data = await syncConnectorAccessDefinitions(connectorId);
      // Apply a label-keyword pass to refine CRUD types the endpoint-name heuristic may have missed
      const refined = data.definitions.map(def => {
        const suggested = refineCrudFromLabel(def.label);
        return suggested ? { ...def, crud_type: suggested } : def;
      });
      setDefinitions(refined);
      if ((data as any).warning) toast.warning((data as any).warning);
      else toast.success(`Synced ${refined.length} tool${refined.length !== 1 ? 's' : ''} from connector`);
    } catch {
      toast.error('Failed to sync tools from connector');
    } finally {
      setSyncing(false);
    }
  };

  const handleChange = (index: number, field: keyof ConnectorAccessDefinition, value: string) => {
    setDefinitions(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  };

  const handleRemove = (index: number) => {
    setDefinitions(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await putConnectorAccessDefinitions(connectorId, definitions);
      toast.success('Access definitions saved');
    } catch {
      toast.error('Failed to save access definitions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 px-4 py-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
        <p className="text-sm text-amber-800 dark:text-amber-400">
          Saving will <strong>delete and replace</strong> all existing access definitions for this connector.
          Permissions already granted to users that reference removed definitions will lose those grants.{' '}
          CRUD type detection is automatic but not perfect — <strong>verify each type before saving</strong>.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {definitions.length} definition{definitions.length !== 1 ? 's' : ''} — one per endpoint
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync from MCP'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save Definitions'}
          </Button>
        </div>
      </div>

      {definitions.length === 0 && (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Click "Sync from MCP" to pull tool definitions directly from the connector.
        </div>
      )}

      {definitions.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_1.4fr_2fr_120px_36px] gap-3 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b">
            <span>Key</span>
            <span>Label</span>
            <span>Description</span>
            <span>CRUD Type</span>
            <span />
          </div>

          {/* Definition rows */}
          <div className="divide-y">
            {definitions.map((def, i) => (
              <div key={def.key} className="grid grid-cols-[1fr_1.4fr_2fr_120px_36px] gap-3 px-4 py-3 items-center">
                <span className="font-mono text-xs text-muted-foreground truncate" title={def.key}>
                  {def.key}
                </span>
                <Input
                  className="h-8 text-sm"
                  value={def.label}
                  onChange={(e) => handleChange(i, 'label', e.target.value)}
                  placeholder="Label"
                />
                <Input
                  className="h-8 text-sm"
                  value={def.description ?? ''}
                  onChange={(e) => handleChange(i, 'description', e.target.value || null as any)}
                  placeholder="Description (optional)"
                />
                <Select
                  value={def.crud_type}
                  onValueChange={(v) => handleChange(i, 'crud_type', v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['read', 'create', 'update', 'delete'] as const).map(t => (
                      <SelectItem key={t} value={t}>{CRUD_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function EditConnectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectorId } = use(params);
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<Connector>>({});

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

    try {
      setLoading(true);
      const payload = Object.fromEntries(
        Object.entries(formData).filter(([, v]) => v !== null)
      ) as Parameters<typeof updateConnector>[1];
      await updateConnector(connectorId, payload);
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

      <Tabs defaultValue="basic" className="w-full">
        <TabsList>
          <TabsTrigger value="basic">Basic Details</TabsTrigger>
          <TabsTrigger value="schema">MCP</TabsTrigger>
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="access">Access Definitions</TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit}>
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
                <CardTitle>MCP Schema</CardTitle>
                <CardDescription>
                  Define custom fields that organizations fill when configuring this connector for MCP access
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

          <TabsContent value="agent" className="mt-6 space-y-6">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>Agent Authentication</CardTitle>
                <CardDescription>
                  Configure how the AI Agent authenticates with this connector and what org admins see in the AI Agent → Connectors tab
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent_auth_type">Agent Auth Type</Label>
                  <Select
                    value={formData.agent_auth_type || 'none'}
                    onValueChange={(v) => setFormData({ ...formData, agent_auth_type: v as 'none' | 'google_oauth' })}
                  >
                    <SelectTrigger id="agent_auth_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (no extra auth required)</SelectItem>
                      <SelectItem value="google_oauth">Google OAuth (account login required)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Whether org admins need to connect an account for the agent to use this connector.
                    <strong> None</strong> = the connector works with existing credentials.
                    <strong> Google OAuth</strong> = org admins must log in with a Google account in the AI Agent → Connectors tab.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent_instruction">Instruction for Org Admins</Label>
                  <textarea
                    id="agent_instruction"
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.agent_instruction || ''}
                    onChange={(e) => setFormData({ ...formData, agent_instruction: e.target.value })}
                    placeholder="e.g. Log in to the Google account your agent will use to send and read emails on behalf of your organization."
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown to org admins below the connector name in the AI Agent → Connectors tab. Leave empty for connectors that need no explanation (e.g. "No additional configuration needed").
                  </p>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          <div className="mt-6 flex gap-4">
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>

        <TabsContent value="access" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Access Definitions</CardTitle>
              <CardDescription>
                Configure the permission entries exposed by this connector's endpoints.
                Each endpoint gets its own access definition that can be toggled per access group.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccessDefinitionsTab connectorId={connectorId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
