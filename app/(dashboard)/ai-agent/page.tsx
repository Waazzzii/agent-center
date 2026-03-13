'use client';

import { useEffect, useState } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { usePermission } from '@/lib/hooks/use-permission';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import {
  getAiAgentStatus,
  enableAgent,
  disableAgent,
  saveAnthropicKey,
  removeAnthropicKey,
  type AiAgentStatus,
} from '@/lib/api/ai-agent';
import { getConnectors, getConnectorOAuthUrl, disconnectConnectorOAuth } from '@/lib/api/connectors';
import type { OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, AlertCircle, KeyRound, Bot, Plug, ExternalLink, Settings, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function AiAgentPage() {
  const { selectedOrgId, selectedOrgName } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState('settings');

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'connectors') setActiveTab('connectors');
  }, []);
  const permitted = useRequirePermission('agents_read');
  const canUpdate = usePermission('agents_update');

  const [status, setStatus] = useState<AiAgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentToggling, setAgentToggling] = useState(false);

  const [anthropicKey, setAnthropicKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);

  const [connectors, setConnectors] = useState<OrganizationConnector[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState<string | null>(null);
  const [oauthDisconnecting, setOauthDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrgId || !permitted) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, permitted]);

  const load = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getAiAgentStatus(selectedOrgId);
      setStatus(data);
      if (data.is_authorized) loadConnectors();
    } catch {
      toast.error('Failed to load AI agent settings');
    } finally {
      setLoading(false);
    }
  };

  const loadConnectors = async () => {
    if (!selectedOrgId) return;
    try {
      setConnectorsLoading(true);
      const data = await getConnectors(selectedOrgId);
      setConnectors(data.connectors.filter((c) => c.is_enabled));
    } catch {
      toast.error('Failed to load connectors');
    } finally {
      setConnectorsLoading(false);
    }
  };

  const handleEnable = async () => {
    if (!selectedOrgId) return;
    try {
      setAgentToggling(true);
      await enableAgent(selectedOrgId);
      await load();
      toast.success('AI Agent enabled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to enable agent');
    } finally {
      setAgentToggling(false);
    }
  };

  const handleDisable = async () => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: 'Disable AI Agent',
      description: 'This will revoke the agent token. Agents will stop executing until re-enabled.',
      confirmText: 'Disable',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      setAgentToggling(true);
      await disableAgent(selectedOrgId);
      setStatus((prev) => prev
        ? {
            ...prev,
            is_authorized: false,
            authorized_by_email: null,
            connected_at: null,
            last_refreshed_at: null,
            has_anthropic_key: false,
            anthropic_key_masked: null,
          }
        : null
      );
      setConnectors([]);
      toast.success('AI Agent disabled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to disable agent');
    } finally {
      setAgentToggling(false);
    }
  };

  const handleSaveKey = async () => {
    if (!selectedOrgId || !anthropicKey.trim()) return;
    try {
      setKeyLoading(true);
      const { anthropic_key_masked } = await saveAnthropicKey(selectedOrgId, anthropicKey.trim());
      setStatus((prev) => prev ? { ...prev, has_anthropic_key: true, anthropic_key_masked } : null);
      setAnthropicKey('');
      setShowKey(false);
      toast.success('Anthropic API key saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save API key');
    } finally {
      setKeyLoading(false);
    }
  };

  const handleRemoveKey = async () => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: 'Remove Anthropic API Key',
      description: 'Agents will not be able to execute until a new API key is configured.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      setKeyLoading(true);
      await removeAnthropicKey(selectedOrgId);
      setStatus((prev) => prev ? { ...prev, has_anthropic_key: false, anthropic_key_masked: null } : null);
      setShowKey(false);
      toast.success('Anthropic API key removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove API key');
    } finally {
      setKeyLoading(false);
    }
  };

  const handleConnectOAuth = async (connectorId: string) => {
    if (!selectedOrgId) return;
    try {
      setOauthConnecting(connectorId);
      const authUrl = await getConnectorOAuthUrl(selectedOrgId, connectorId);
      window.location.href = authUrl;
    } catch (err: any) {
      toast.error(err.message || 'Failed to start OAuth flow');
      setOauthConnecting(null);
    }
  };

  const handleDisconnectOAuth = async (connector: OrganizationConnector) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: `Disconnect ${connector.connector_name}`,
      description: `This will remove the connected account. The agent will no longer be able to use ${connector.connector_name}.`,
      confirmText: 'Disconnect',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      setOauthDisconnecting(connector.id);
      await disconnectConnectorOAuth(selectedOrgId, connector.id);
      await loadConnectors();
      toast.success(`${connector.connector_name} disconnected`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
    } finally {
      setOauthDisconnecting(null);
    }
  };

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI Agent</h1>
        <p className="text-muted-foreground">Manage AI Agent settings for {selectedOrgName}</p>
      </div>

      {loading ? (

        /* ── Loading state ──────────────────────────────────────────────── */
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>

      ) : !status?.is_authorized ? (

        /* ── Disabled state ─────────────────────────────────────────────── */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">AI Agent is disabled</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Enable the AI Agent to allow automated actions using connector tools on behalf of {selectedOrgName}.
            </p>
            <Button
              onClick={handleEnable}
              disabled={agentToggling || !canUpdate}
              title={!canUpdate ? "You don't have permission to perform this action" : undefined}
            >
              {agentToggling ? 'Enabling…' : 'Enable AI Agent'}
            </Button>
          </CardContent>
        </Card>

      ) : (

        /* ── Enabled state ──────────────────────────────────────────────── */
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="connectors">
                <Plug className="h-4 w-4 mr-2" />
                Connectors
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisable}
              disabled={agentToggling || !canUpdate}
              title={!canUpdate ? "You don't have permission to perform this action" : undefined}
            >
              {agentToggling ? 'Disabling…' : 'Disable'}
            </Button>
          </div>

          {/* ── Settings Tab ───────────────────────────────────────────────── */}
          <TabsContent value="settings" className="mt-6 space-y-6">

            {/* Agent status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Agent Access
                </CardTitle>
                <CardDescription>
                  The AI agent is authorized to execute connector tools on behalf of this organization.
                  The platform OAuth token is stored securely and rotated automatically on each use.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm dark:border-green-800 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-medium text-green-800 dark:text-green-200">Authorized</p>
                    <p className="text-green-700 dark:text-green-300">
                      By {status.authorized_by_email}
                      {status.connected_at && (
                        <> &middot; {new Date(status.connected_at).toLocaleDateString()}</>
                      )}
                      {status.last_refreshed_at && (
                        <> &middot; Last used {new Date(status.last_refreshed_at).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Anthropic API Key */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5" />
                  Anthropic API Key
                </CardTitle>
                <CardDescription>
                  Your organization&apos;s Anthropic API key used by the agent to execute
                  actions via the Anthropic API. Stored encrypted in Secret Manager.{' '}
                  <a
                    href="https://platform.claude.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2"
                  >
                    Get your key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {status.has_anthropic_key ? (
                  <div className="space-y-3">
                    {status.anthropic_key_masked && (
                      <p className="text-xs text-muted-foreground">
                        Current:{' '}
                        <span className="font-mono">{status.anthropic_key_masked}</span>
                      </p>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="new-key">Replace key</Label>
                      <div className="relative">
                        <Input
                          id="new-key"
                          type={showKey ? 'text' : 'password'}
                          placeholder={status.anthropic_key_masked ?? 'sk-ant-...'}
                          value={anthropicKey}
                          onChange={(e) => setAnthropicKey(e.target.value)}
                          disabled={!canUpdate}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowKey(!showKey)}
                          tabIndex={-1}
                        >
                          {showKey
                            ? <EyeOff className="h-4 w-4 text-muted-foreground" />
                            : <Eye className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveKey}
                        disabled={!anthropicKey.trim() || keyLoading || !canUpdate}
                      >
                        {keyLoading ? 'Saving…' : 'Update Key'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRemoveKey}
                        disabled={keyLoading || !canUpdate}
                        className="border-destructive text-destructive hover:bg-destructive/10"
                      >
                        Remove Key
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <p className="text-amber-800 dark:text-amber-300">
                        No API key configured — agents cannot execute until a key is added.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="api-key">API Key</Label>
                      <div className="relative">
                        <Input
                          id="api-key"
                          type={showKey ? 'text' : 'password'}
                          placeholder="sk-ant-..."
                          value={anthropicKey}
                          onChange={(e) => setAnthropicKey(e.target.value)}
                          disabled={!canUpdate}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowKey(!showKey)}
                          tabIndex={-1}
                        >
                          {showKey
                            ? <EyeOff className="h-4 w-4 text-muted-foreground" />
                            : <Eye className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSaveKey}
                      disabled={!anthropicKey.trim() || keyLoading || !canUpdate}
                    >
                      {keyLoading ? 'Saving…' : 'Save Key'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

          </TabsContent>

          {/* ── Connector Authorizations Tab ───────────────────────────────── */}
          <TabsContent value="connectors" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="h-5 w-5" />
                  Connector Authorizations
                </CardTitle>
                <CardDescription>
                  Authorize the connectors your agent can use to perform actions.
                  OAuth connectors require an account login; others are available once enabled.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {connectorsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : connectors.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-muted px-4 py-3 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    No enabled connectors found. Enable connectors in the Connectors section first.
                  </div>
                ) : (
                  <div className="divide-y">
                    {connectors.map((connector) => {
                      const isOAuth = connector.agent_auth_type === 'google_oauth';
                      const isOAuthConnected = connector.agent_config?.oauth_connected === 'true';
                      const connectedEmail = connector.agent_config?.connected_email as string | undefined;
                      const isThisConnecting = oauthConnecting === connector.id;
                      const isThisDisconnecting = oauthDisconnecting === connector.id;

                      return (
                        <div key={connector.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium">{connector.connector_name}</p>
                            {isOAuth ? (
                              isOAuthConnected ? (
                                <p className="text-xs text-muted-foreground">Connected as {connectedEmail}</p>
                              ) : (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                  {connector.agent_instruction || 'No account connected — login required'}
                                </p>
                              )
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {connector.agent_instruction || 'Available via configured credentials'}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {isOAuth ? (
                              isOAuthConnected ? (
                                <>
                                  <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800">
                                    Connected
                                  </Badge>
                                  {canUpdate && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDisconnectOAuth(connector)}
                                      disabled={isThisDisconnecting}
                                      className="text-xs h-7"
                                    >
                                      {isThisDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <>
                                  {canUpdate && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleConnectOAuth(connector.id)}
                                      disabled={isThisConnecting}
                                      className="text-xs h-7"
                                    >
                                      {isThisConnecting ? 'Connecting…' : `Connect ${connector.connector_name}`}
                                    </Button>
                                  )}
                                </>
                              )
                            ) : (
                              <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800">
                                Available
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      )}
    </div>
  );
}
