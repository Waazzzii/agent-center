'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  getAgent, updateAgent, deleteAgent,
  createAction, updateAction, deleteAction, reorderActions,
  createTrigger, updateTrigger, deleteTrigger,
  generateWebhookKey, listWebhookKeys, revokeWebhookKey,
  getPendingHitl, approveHitl, denyHitl,
  getExecutionHistory,
  type AgentDetail, type AgentAction, type AgentTrigger, type AgentWebhookKey, type AgentHitlItem,
} from '@/lib/api/agents';
import { getConnectors } from '@/lib/api/connectors';
import type { OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Pencil, Trash2, Copy, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp, Webhook, Clock, Play, Link2 } from 'lucide-react';

// ─── Cron description helper ──────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtHour(h: number) {
  if (h === 0) return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'Custom schedule';
  const [min, hour, dom, month, dow] = parts as [string, string, string, string, string];

  if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
  if (hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`;

  if (min === '*' && hour === '*') return 'Every minute';

  const minutes = min === '*' ? '00' : pad(parseInt(min));
  const specificMin = /^\d+$/.test(min) ? parseInt(min) : 0;

  const parseHours = (h: string) => {
    if (h === '*') return null;
    return h.split(',').map((v) => parseInt(v.trim())).filter((v) => !isNaN(v));
  };
  const hours = parseHours(hour);

  const timeStr = hours
    ? hours.map((h) => {
        const suffix = h < 12 ? 'AM' : 'PM';
        const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${display}:${pad(specificMin)} ${suffix}`;
      }).join(', ')
    : `each hour at :${minutes}`;

  if (dow !== '*' && /^\d+$/.test(dow)) {
    const dayName = DAYS[parseInt(dow)];
    return `Every ${dayName ?? 'day'} at ${timeStr}`;
  }
  if (dom !== '*' && /^\d+$/.test(dom)) return `On the ${dom} of each month at ${timeStr}`;
  if (dom === '*' && dow === '*') return `Every day at ${timeStr}`;

  return 'Custom schedule';
}

function nextFirings(expr: string, count = 3): string[] {
  // Simple approximation: just show the next occurrences relative to now
  // for common patterns
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return [];
  const [min, hour] = parts as [string, string];
  const results: string[] = [];
  const now = new Date();

  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    const m = parseInt(min), h = parseInt(hour);
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(h, m);
    if (next <= now) next.setDate(next.getDate() + 1);
    for (let i = 0; i < count; i++) {
      results.push(new Date(next).toLocaleString());
      next.setDate(next.getDate() + 1);
    }
  } else if (min.startsWith('*/')) {
    const interval = parseInt(min.slice(2));
    const next = new Date(now);
    const rem = interval - (next.getMinutes() % interval);
    next.setMinutes(next.getMinutes() + rem, 0, 0);
    for (let i = 0; i < count; i++) {
      results.push(new Date(next).toLocaleString());
      next.setMinutes(next.getMinutes() + interval);
    }
  }
  return results;
}

// ─── Main Component ───────────────────────────────────────────

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params);
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const { confirm } = useConfirmDialog();

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [triggers, setTriggers] = useState<AgentTrigger[]>([]);
  const [hitlItems, setHitlItems] = useState<AgentHitlItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<OrganizationConnector[]>([]);
  const [webhookKeys, setWebhookKeys] = useState<Record<string, AgentWebhookKey[]>>({});
  const [loading, setLoading] = useState(true);

  // Action dialog
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<AgentAction | null>(null);
  const [actionForm, setActionForm] = useState({ name: '', action_type: 'prompt' as 'prompt' | 'hitl', prompt: '', model: 'claude-sonnet-4-6', connector_ids: [] as string[], hitl_instructions: '' });
  const [savingAction, setSavingAction] = useState(false);

  // Trigger dialog
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [triggerForm, setTriggerForm] = useState({ trigger_type: 'manual' as string, cron_expr: '0 9 * * *', description: '' });
  const [savingTrigger, setSavingTrigger] = useState(false);

  // Generated webhook key reveal
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  // Agent edit
  const [editingAgent, setEditingAgent] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentDesc, setAgentDesc] = useState('');

  useEffect(() => {
    if (selectedOrgId && agentId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, agentId]);

  const loadAll = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const [agentData, connData, hitlData] = await Promise.all([
        getAgent(selectedOrgId, agentId),
        getConnectors(selectedOrgId),
        getPendingHitl(selectedOrgId),
      ]);
      setAgent(agentData);
      setAgentName(agentData.name);
      setAgentDesc(agentData.description ?? '');
      setActions(agentData.actions.sort((a, b) => a.order_index - b.order_index));
      setTriggers(agentData.triggers);
      setConnectors(connData.connectors);
      setHitlItems(hitlData.items.filter((h) => h.agent_id === agentId));
    } catch (err: any) {
      toast.error('Failed to load agent');
      router.push('/agents');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, agentId, router]);

  const loadHistory = async () => {
    if (!selectedOrgId) return;
    try {
      const data = await getExecutionHistory(selectedOrgId, { agent_id: agentId });
      setHistory(data.runs ?? []);
    } catch {
      setHistory([]);
    }
  };

  const loadWebhookKeys = async (triggerId: string) => {
    if (!selectedOrgId) return;
    try {
      const keys = await listWebhookKeys(selectedOrgId, agentId, triggerId);
      setWebhookKeys((prev) => ({ ...prev, [triggerId]: keys }));
    } catch { /* silent */ }
  };

  // ── Actions ──

  const openNewAction = () => {
    setEditingAction(null);
    setActionForm({ name: '', action_type: 'prompt', prompt: '', model: 'claude-sonnet-4-6', connector_ids: [], hitl_instructions: '' });
    setActionDialogOpen(true);
  };

  const openEditAction = (action: AgentAction) => {
    setEditingAction(action);
    setActionForm({
      name: action.name,
      action_type: action.action_type,
      prompt: action.prompt ?? '',
      model: action.model ?? 'claude-sonnet-4-6',
      connector_ids: action.connector_ids ?? [],
      hitl_instructions: action.hitl_instructions ?? '',
    });
    setActionDialogOpen(true);
  };

  const handleSaveAction = async () => {
    if (!selectedOrgId || !actionForm.name.trim()) return;
    try {
      setSavingAction(true);
      const payload = {
        name: actionForm.name.trim(),
        action_type: actionForm.action_type,
        ...(actionForm.action_type === 'prompt' ? {
          prompt: actionForm.prompt.trim(),
          model: actionForm.model,
          connector_ids: actionForm.connector_ids,
        } : {
          hitl_instructions: actionForm.hitl_instructions.trim(),
        }),
      };
      if (editingAction) {
        await updateAction(selectedOrgId, agentId, editingAction.id, payload);
        toast.success('Action updated');
      } else {
        await createAction(selectedOrgId, agentId, payload);
        toast.success('Action added');
      }
      setActionDialogOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save action');
    } finally {
      setSavingAction(false);
    }
  };

  const handleDeleteAction = async (actionId: string, name: string) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({ title: 'Delete Action', description: `Delete "${name}"?`, confirmText: 'Delete', cancelText: 'Cancel', variant: 'destructive' });
    if (!confirmed) return;
    try {
      await deleteAction(selectedOrgId, agentId, actionId);
      toast.success('Action deleted');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete action');
    }
  };

  const moveAction = async (index: number, direction: 'up' | 'down') => {
    if (!selectedOrgId) return;
    const newActions = [...actions];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newActions.length) return;
    [newActions[index], newActions[swapIdx]] = [newActions[swapIdx]!, newActions[index]!];
    setActions(newActions);
    try {
      await reorderActions(selectedOrgId, agentId, newActions.map((a) => a.id));
    } catch (err: any) {
      toast.error('Reorder failed');
      await loadAll();
    }
  };

  // ── Triggers ──

  const handleSaveTrigger = async () => {
    if (!selectedOrgId) return;
    try {
      setSavingTrigger(true);
      const config: Record<string, unknown> = {};
      if (triggerForm.trigger_type === 'cron') config.cron_expr = triggerForm.cron_expr;
      if (triggerForm.description) config.description = triggerForm.description;
      await createTrigger(selectedOrgId, agentId, { trigger_type: triggerForm.trigger_type, config });
      toast.success('Trigger created');
      setTriggerDialogOpen(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create trigger');
    } finally {
      setSavingTrigger(false);
    }
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({ title: 'Delete Trigger', description: 'Delete this trigger?', confirmText: 'Delete', cancelText: 'Cancel', variant: 'destructive' });
    if (!confirmed) return;
    try {
      await deleteTrigger(selectedOrgId, agentId, triggerId);
      toast.success('Trigger deleted');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete trigger');
    }
  };

  const handleToggleTrigger = async (trigger: AgentTrigger) => {
    if (!selectedOrgId) return;
    try {
      await updateTrigger(selectedOrgId, agentId, trigger.id, { is_active: !trigger.is_active });
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle trigger');
    }
  };

  const handleGenerateKey = async (triggerId: string) => {
    if (!selectedOrgId) return;
    try {
      const result = await generateWebhookKey(selectedOrgId, agentId, triggerId);
      setNewRawKey(result.rawKey);
      await loadWebhookKeys(triggerId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate key');
    }
  };

  const handleRevokeKey = async (triggerId: string, keyId: string) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({ title: 'Revoke Key', description: 'Revoke this webhook key? It will stop working immediately.', confirmText: 'Revoke', cancelText: 'Cancel', variant: 'destructive' });
    if (!confirmed) return;
    try {
      await revokeWebhookKey(selectedOrgId, agentId, triggerId, keyId);
      toast.success('Key revoked');
      await loadWebhookKeys(triggerId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke key');
    }
  };

  // ── HITL ──

  const handleApprove = async (hitlId: string) => {
    if (!selectedOrgId) return;
    try {
      await approveHitl(selectedOrgId, hitlId);
      toast.success('Approved — agent will resume');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    }
  };

  const handleDeny = async (hitlId: string) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({ title: 'Deny Approval', description: 'Deny this approval request? The agent execution will stop.', confirmText: 'Deny', cancelText: 'Cancel', variant: 'destructive' });
    if (!confirmed) return;
    try {
      await denyHitl(selectedOrgId, hitlId);
      toast.success('Denied — agent execution stopped');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to deny');
    }
  };

  // ── Agent edit ──

  const handleSaveAgent = async () => {
    if (!selectedOrgId) return;
    try {
      await updateAgent(selectedOrgId, agentId, { name: agentName.trim(), description: agentDesc.trim() || undefined });
      toast.success('Agent updated');
      setEditingAgent(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update agent');
    }
  };

  const triggerIcon = { webhook: <Webhook className="h-4 w-4" />, cron: <Clock className="h-4 w-4" />, manual: <Play className="h-4 w-4" />, hitl: <Link2 className="h-4 w-4" /> };
  const triggerLabel = { webhook: 'Webhook', cron: 'Cron Schedule', manual: 'Manual', hitl: 'After HITL Complete' };

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/agents')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          {editingAgent ? (
            <div className="flex items-center gap-2">
              <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} className="text-xl font-bold h-auto py-1 max-w-xs" />
              <Button size="sm" onClick={handleSaveAgent} disabled={!agentName.trim()}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingAgent(false); setAgentName(agent.name); setAgentDesc(agent.description ?? ''); }}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <Badge variant={agent.is_active ? 'default' : 'secondary'}>{agent.is_active ? 'Active' : 'Inactive'}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setEditingAgent(true)}><Pencil className="h-4 w-4" /></Button>
            </div>
          )}
          {!editingAgent && agent.description && <p className="text-sm text-muted-foreground">{agent.description}</p>}
        </div>
      </div>

      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions">Actions ({actions.length})</TabsTrigger>
          <TabsTrigger value="triggers">Triggers ({triggers.length})</TabsTrigger>
          <TabsTrigger value="hitl">HITL Approvals {hitlItems.filter(h => h.status === 'pending').length > 0 && <Badge variant="destructive" className="ml-1 text-xs">{hitlItems.filter(h => h.status === 'pending').length}</Badge>}</TabsTrigger>
          <TabsTrigger value="history" onClick={loadHistory}>History</TabsTrigger>
        </TabsList>

        {/* ── Actions Tab ─────────────────────────────────────── */}
        <TabsContent value="actions" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewAction}><Plus className="mr-2 h-4 w-4" />Add Action</Button>
          </div>
          {actions.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No actions yet. Add one to build your agent workflow.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {actions.map((action, idx) => (
                <div key={action.id}>
                  <Card className="group">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col gap-1 pt-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveAction(idx, 'up')} disabled={idx === 0}><ChevronUp className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveAction(idx, 'down')} disabled={idx === actions.length - 1}><ChevronDown className="h-3 w-3" /></Button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground font-mono">{idx + 1}</span>
                            <span className="font-medium">{action.name}</span>
                            <Badge variant={action.action_type === 'hitl' ? 'outline' : 'secondary'} className={action.action_type === 'hitl' ? 'border-orange-400 text-orange-600' : ''}>
                              {action.action_type === 'hitl' ? 'HITL Gate' : 'Prompt'}
                            </Badge>
                            {action.action_type === 'prompt' && action.connector_ids && action.connector_ids.length > 0 && (
                              <Badge variant="outline">{action.connector_ids.length} connector{action.connector_ids.length !== 1 ? 's' : ''}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 truncate max-w-lg">
                            {action.action_type === 'prompt' ? (action.prompt ?? '—') : (action.hitl_instructions ?? '—')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" onClick={() => openEditAction(action)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteAction(action.id, action.name)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  {idx < actions.length - 1 && (
                    <div className="flex justify-center py-1"><div className="h-5 w-0.5 bg-border" /></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Triggers Tab ────────────────────────────────────── */}
        <TabsContent value="triggers" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setTriggerDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Trigger</Button>
          </div>
          {triggers.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No triggers yet. Add one to control when this agent runs.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {triggers.map((t) => (
                <Card key={t.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 text-muted-foreground">{triggerIcon[t.trigger_type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{triggerLabel[t.trigger_type]}</span>
                          <Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                        </div>
                        {t.trigger_type === 'cron' && (
                          <p className="text-sm text-muted-foreground mt-1">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{String(t.config.cron_expr ?? '')}</code>
                            {' — '}{describeCron(String(t.config.cron_expr ?? ''))}
                          </p>
                        )}
                        {t.trigger_type === 'webhook' && (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                                {`https://api.wazzi.io/webhooks/agents/${t.id}`}
                              </code>
                              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`https://api.wazzi.io/webhooks/agents/${t.id}`)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button variant="outline" size="sm" onClick={() => { loadWebhookKeys(t.id); handleGenerateKey(t.id); }}>
                                <RefreshCw className="mr-1 h-3 w-3" />Generate API Key
                              </Button>
                            </div>
                            {webhookKeys[t.id] && webhookKeys[t.id]!.length > 0 && (
                              <div className="space-y-1">
                                {webhookKeys[t.id]!.map((k) => (
                                  <div key={k.id} className="flex items-center gap-2 text-xs">
                                    <code className="bg-muted px-2 py-1 rounded">{k.key_prefix}…</code>
                                    <span className="text-muted-foreground">{new Date(k.created_at).toLocaleDateString()}</span>
                                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => handleRevokeKey(t.id, k.id)}>Revoke</Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch checked={t.is_active} onCheckedChange={() => handleToggleTrigger(t)} />
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteTrigger(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── HITL Tab ─────────────────────────────────────────── */}
        <TabsContent value="hitl" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={loadAll}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>
          {hitlItems.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No pending approvals.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {hitlItems.map((h) => (
                <Card key={h.id} className={h.status === 'pending' ? 'border-orange-300' : ''}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{h.action_name ?? 'HITL Gate'}</span>
                          <Badge variant={h.status === 'pending' ? 'outline' : h.status === 'approved' ? 'default' : 'secondary'} className={h.status === 'pending' ? 'border-orange-400 text-orange-600' : ''}>
                            {h.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                        {!!h.context.instructions && <p className="text-sm mt-1 text-muted-foreground">{String(h.context.instructions)}</p>}
                        {!!h.context.previous_output && (
                          <details className="mt-1">
                            <summary className="text-xs text-muted-foreground cursor-pointer">Previous step output</summary>
                            <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto max-h-32">{String(h.context.previous_output).slice(0, 500)}</pre>
                          </details>
                        )}
                      </div>
                      {h.status === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" onClick={() => handleApprove(h.id)}><CheckCircle className="mr-1 h-4 w-4" />Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDeny(h.id)}><XCircle className="mr-1 h-4 w-4" />Deny</Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── History Tab ──────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No execution history found.</p>
                <p className="text-xs text-muted-foreground mt-1">Requires LANGCHAIN_API_KEY to be configured.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Execution History</CardTitle><CardDescription>Last 30 days from LangSmith</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {history.map((run: any) => (
                    <div key={run.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <Badge variant={run.status === 'success' ? 'default' : run.status === 'error' ? 'destructive' : 'secondary'}>{run.status}</Badge>
                      <span className="text-sm font-medium flex-1">{run.name}</span>
                      <span className="text-xs text-muted-foreground">{run.latency_ms ? `${(run.latency_ms / 1000).toFixed(1)}s` : '—'}</span>
                      <span className="text-xs text-muted-foreground">{run.start_time ? new Date(run.start_time).toLocaleString() : '—'}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Action Dialog ─────────────────────────────────────── */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAction ? 'Edit Action' : 'Add Action'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Action name" value={actionForm.name} onChange={(e) => setActionForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={actionForm.action_type} onValueChange={(v) => setActionForm(f => ({ ...f, action_type: v as 'prompt' | 'hitl' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prompt">Prompt Action</SelectItem>
                  <SelectItem value="hitl">HITL Approval Gate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {actionForm.action_type === 'prompt' && (
              <>
                <div className="space-y-1">
                  <Label>Prompt / Instructions <span className="text-destructive">*</span></Label>
                  <Textarea placeholder="Describe what this step should do…" value={actionForm.prompt} onChange={(e) => setActionForm(f => ({ ...f, prompt: e.target.value }))} rows={5} className="text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <Label>Model</Label>
                  <Select value={actionForm.model} onValueChange={(v) => setActionForm(f => ({ ...f, model: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6</SelectItem>
                      <SelectItem value="claude-opus-4-6">Claude Opus 4.6</SelectItem>
                      <SelectItem value="claude-haiku-4-5-20251001">Claude Haiku 4.5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {connectors.length > 0 && (
                  <div className="space-y-1">
                    <Label>Connectors</Label>
                    <div className="space-y-2 rounded-md border p-3 max-h-40 overflow-y-auto">
                      {connectors.map((c) => (
                        <div key={c.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`conn-${c.id}`}
                            checked={actionForm.connector_ids.includes(c.id)}
                            onCheckedChange={(checked) => {
                              setActionForm(f => ({
                                ...f,
                                connector_ids: checked ? [...f.connector_ids, c.id] : f.connector_ids.filter(id => id !== c.id),
                              }));
                            }}
                          />
                          <label htmlFor={`conn-${c.id}`} className="text-sm cursor-pointer">{(c as any).connector_name ?? c.id}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {actionForm.action_type === 'hitl' && (
              <div className="space-y-1">
                <Label>Instructions for Approver</Label>
                <Textarea placeholder="Describe what the approver needs to review and decide…" value={actionForm.hitl_instructions} onChange={(e) => setActionForm(f => ({ ...f, hitl_instructions: e.target.value }))} rows={4} className="text-sm" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAction} disabled={savingAction || !actionForm.name.trim() || (actionForm.action_type === 'prompt' && !actionForm.prompt.trim())}>
              {savingAction ? 'Saving…' : editingAction ? 'Update' : 'Add Action'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Trigger Dialog ────────────────────────────────────── */}
      <Dialog open={triggerDialogOpen} onOpenChange={setTriggerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Trigger</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={triggerForm.trigger_type} onValueChange={(v) => setTriggerForm(f => ({ ...f, trigger_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="cron">Cron Schedule</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="hitl">After HITL Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {triggerForm.trigger_type === 'cron' && (
              <>
                <div className="space-y-1">
                  <Label>Cron Expression</Label>
                  <Input placeholder="0 9 * * *" value={triggerForm.cron_expr} onChange={(e) => setTriggerForm(f => ({ ...f, cron_expr: e.target.value }))} className="font-mono" />
                </div>
                {triggerForm.cron_expr && (
                  <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                    <p className="font-medium">{describeCron(triggerForm.cron_expr)}</p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {nextFirings(triggerForm.cron_expr).map((d, i) => <p key={i}>Next {i + 1}: {d}</p>)}
                    </div>
                  </div>
                )}
              </>
            )}

            {triggerForm.trigger_type === 'webhook' && (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                A webhook URL and API key will be generated after creation. Use the <code>X-Wazzi-Key</code> header to authenticate requests.
              </div>
            )}

            {triggerForm.trigger_type === 'manual' && (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Manual triggers can be fired from the agent detail page.
              </div>
            )}

            {triggerForm.trigger_type === 'hitl_complete' && (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                This agent will automatically continue after any HITL approval in its chain is completed.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTriggerDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTrigger} disabled={savingTrigger}>
              {savingTrigger ? 'Creating…' : 'Create Trigger'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Raw Key Reveal Dialog ─────────────────────────────── */}
      <Dialog open={!!newRawKey} onOpenChange={(o) => { if (!o) setNewRawKey(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>API Key Generated</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive font-medium">
              ⚠ Copy this key now. It will not be shown again.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all">{newRawKey}</code>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(newRawKey!); toast.success('Copied'); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewRawKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
