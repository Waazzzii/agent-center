'use client';

import { use, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  getAgent, updateAgent, deleteAgent,
  getActions, createAction, updateAction, deleteAction, reorderActions,
  createTrigger, deleteTrigger,
  generateWebhookKey, getWebhookKey,
  getApprovals, getValidSubAgents,
  type Agent, type AgentDetail, type AgentAction, type AgentTrigger, type AgentWebhookKey,
} from '@/lib/api/agents';
import { getConnectors } from '@/lib/api/connectors';
import { getSkills, type Skill } from '@/lib/api/skills';
import { listScripts, type BrowserScript } from '@/lib/api/scripts';
import { listAiSteps, type AiStep } from '@/lib/api/ai-steps';
import { listLogins, type Login } from '@/lib/api/logins';
import { useEventStream } from '@/lib/hooks/use-event-stream';
import { EntityPreviewNotice } from '@/components/actions/EntityPreviewNotice';
import { AiStepPreview } from '@/components/actions/AiStepPreview';
import { LoginPreview } from '@/components/actions/LoginPreview';
import { BrowserScriptPreview } from '@/components/actions/BrowserScriptPreview';
import { SubAgentPreview } from '@/components/actions/SubAgentPreview';
import { ApprovalPreview } from '@/components/actions/ApprovalPreview';
import { InfoBlock } from '@/components/actions/InfoBlock';
import {
  getAgentAccessGroups,
  getActionAccessGroups,
  setActionAccessGroups,
  getLoginAccessGroups,
  type AgentAccessGroup,
} from '@/lib/api/agent-access-groups';
import type { OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Trash2, Copy, RefreshCw, ArrowDown, GripVertical,
  Webhook, Clock, Play, History, CheckCircle2, PlayCircle, X, Monitor,
  LogIn, GitBranch, Settings, CircleDot, AlertTriangle, Globe, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Cron description helper ──────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(n: number) { return String(n).padStart(2, '0'); }

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

// ─── Variable Chips ───────────────────────────────────────────

/**
 * Small chip row showing {{variables}} available from prior actions.
 * Clicking a chip inserts `{{name}}` into the target input at its cursor
 * position (or appends if it's a textarea that's not focused).
 */
function VariableChips({
  vars,
  onInsert,
  className,
}: {
  vars: string[];
  onInsert: (token: string) => void;
  className?: string;
}) {
  if (vars.length === 0) return null;
  return (
    <div className={cn('flex items-center gap-1 flex-wrap mt-1', className)}>
      <span className="text-[10px] text-muted-foreground/70">Available:</span>
      {vars.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(`{{${v}}}`)}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted/30 hover:bg-muted hover:border-foreground/30 transition-colors"
        >
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedOrgId } = useAdminViewStore();
  const { confirm } = useConfirmDialog();

  // ?action=<id> — auto-open the edit dialog for a specific action on first load
  const pendingActionId = useRef(searchParams.get('action'));

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [triggers, setTriggers] = useState<AgentTrigger[]>([]);
  const [pendingHitlCount, setPendingHitlCount] = useState(0);
  const [connectors, setConnectors] = useState<OrganizationConnector[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [browserScripts, setBrowserScripts] = useState<BrowserScript[]>([]);
  const [webhookKey, setWebhookKey] = useState<AgentWebhookKey | null>(null);
  const [loading, setLoading] = useState(true);

  // Action dialog
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<AgentAction | null>(null);
  const [actionForm, setActionForm] = useState({
    name: '',
    action_type: 'agent' as 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent',
    approval_instructions: '',
    aiStepId: '',
    loginId: '',
    scriptId: '',
    targetAgentId: '',
    maxConcurrent: 3,
    batchSize: 1,
    maxRetries: 0,
    accessGroupIds: [] as string[],
  });
  const [aiSteps, setAiSteps] = useState<AiStep[]>([]);
  const [logins, setLogins] = useState<Login[]>([]);
  const [validSubAgents, setValidSubAgents] = useState<Agent[]>([]);
  const [savingAction, setSavingAction] = useState(false);
  const [actionTypeModalOpen, setActionTypeModalOpen] = useState(false);

  // Trigger dialog
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [triggerForm, setTriggerForm] = useState({ trigger_type: 'webhook' as string, cron_expr: '0 9 * * *', description: '' });
  const [savingTrigger, setSavingTrigger] = useState(false);

  // Generated webhook key reveal
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  // Drag-and-drop reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Settings (inline, replaces modal)
  const [agentName, setAgentName] = useState('');
  const [agentDesc, setAgentDesc] = useState('');
  const [agentActive, setAgentActive] = useState(true);
  const [agentRequiresBrowser, setAgentRequiresBrowser] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Access groups (used in action dialogs for approval group assignment)
  const [allGroups, setAllGroups] = useState<AgentAccessGroup[]>([]);

  useEffect(() => {
    if (selectedOrgId && agentId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, agentId]);

  const loadAll = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      let [agentData, actionsData, connData, hitlData, skillsData, allGroupsData, scriptsData, aiStepsData, loginsData] = await Promise.all([
        getAgent(selectedOrgId, agentId),
        getActions(selectedOrgId, agentId),
        getConnectors(selectedOrgId),
        getApprovals(selectedOrgId),
        getSkills(selectedOrgId),
        getAgentAccessGroups(selectedOrgId),
        listScripts(selectedOrgId),
        listAiSteps(selectedOrgId).catch(() => [] as AiStep[]),
        listLogins(selectedOrgId).catch(() => [] as Login[]),
      ]);
      if ((agentData.triggers ?? []).length === 0) {
        await createTrigger(selectedOrgId, agentId, { trigger_type: 'manual' });
        agentData = await getAgent(selectedOrgId, agentId);
      }
      setAgent(agentData);
      setAgentName(agentData.name);
      setAgentDesc(agentData.description ?? '');
      setAgentActive(agentData.is_active);
      setAgentRequiresBrowser(agentData.requires_browser ?? false);
      setSettingsDirty(false);
      setActions((actionsData ?? []).sort((a, b) => a.order_index - b.order_index));
      const triggers = agentData.triggers ?? [];
      setTriggers(triggers);
      const webhookTrigger = triggers.find((t) => t.trigger_type === 'webhook');
      if (webhookTrigger) loadWebhookKey(webhookTrigger.id);
      setConnectors(connData.connectors);
      setSkills(skillsData.items ?? []);
      setBrowserScripts(scriptsData.scripts ?? []);
      setAiSteps(aiStepsData);
      setLogins(loginsData);
      setAllGroups(allGroupsData);
      setPendingHitlCount(hitlData.items.filter((h) => h.agent_id === agentId && h.status === 'awaiting_approval').length);
    } catch (err: any) {
      toast.error('Failed to load agent');
      router.push('/agents');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, agentId, router]);

  const loadWebhookKey = async (triggerId: string) => {
    if (!selectedOrgId) return;
    try {
      const key = await getWebhookKey(selectedOrgId, agentId, triggerId);
      setWebhookKey(key);
    } catch { /* silent */ }
  };

  // Auto-open action dialog when ?action=<id> is present (e.g. deep-link from Access page)
  useEffect(() => {
    if (!pendingActionId.current || loading || actions.length === 0) return;
    const target = actions.find((a) => a.id === pendingActionId.current);
    pendingActionId.current = null; // consume
    if (target) openEditAction(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, actions]);

  // Realtime: silently refresh when executions or logins change for this org
  const agentDetailRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventStream({
    topics: selectedOrgId ? [`org:${selectedOrgId}:executions`, `org:${selectedOrgId}:logins`] : [],
    enabled: !!selectedOrgId,
    onEvent: () => {
      if (agentDetailRefresh.current) clearTimeout(agentDetailRefresh.current);
      agentDetailRefresh.current = setTimeout(() => loadAll(), 500);
    },
  });

  // ── Actions ──

  const openNewAction = (type: 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent') => {
    setEditingAction(null);
    setActionForm({
      name: '',
      action_type: type,
      approval_instructions: '',
      aiStepId: '',
      loginId: '',
      scriptId: '',
      targetAgentId: '',
      maxConcurrent: 3,
      batchSize: 1,
      maxRetries: 0,
      accessGroupIds: [],
    });
    if (type === 'sub_agent' && selectedOrgId) {
      getValidSubAgents(selectedOrgId, agentId).then(setValidSubAgents).catch(() => {});
    }
    setActionDialogOpen(true);
  };

  const openEditAction = (action: AgentAction) => {
    setEditingAction(action);
    setActionForm({
      name: action.name,
      action_type: action.action_type,
      approval_instructions: action.approval_instructions ?? '',
      aiStepId: action.ai_step_id ?? '',
      loginId: action.login_id ?? '',
      scriptId: action.script_id ?? '',
      targetAgentId: action.target_agent_id ?? '',
      maxConcurrent: action.max_concurrent ?? 3,
      batchSize: action.batch_size ?? 1,
      maxRetries: action.max_retries ?? 0,
      accessGroupIds: [],
    });
    if (action.action_type === 'sub_agent' && selectedOrgId) {
      getValidSubAgents(selectedOrgId, agentId).then(setValidSubAgents).catch(() => {});
    }
    // Load existing access groups:
    //   - Approval actions: per-action (agent_action_access_groups)
    //   - Login actions: per-login-profile (agent_login_access_groups) — centralized
    //     so groups configured on the same login from any agent stay in sync.
    if (action.action_type === 'approval' && selectedOrgId) {
      getActionAccessGroups(selectedOrgId, action.id).then((groups) => {
        setActionForm((f) => ({ ...f, accessGroupIds: groups.map((g) => g.id) }));
      }).catch(() => {});
    } else if (action.action_type === 'login' && action.login_id && selectedOrgId) {
      getLoginAccessGroups(selectedOrgId, action.login_id).then((groups) => {
        setActionForm((f) => ({ ...f, accessGroupIds: groups.map((g) => g.id) }));
      }).catch(() => {});
    }
    setActionDialogOpen(true);
  };

  const handleSaveAction = async () => {
    if (!selectedOrgId) return;
    // Approval is the only action type that requires a manually-entered name.
    // All others derive it from the selected entity.
    if (actionForm.action_type === 'approval' && !actionForm.name.trim()) return;
    try {
      setSavingAction(true);
      let payload: Record<string, unknown>;
      if (actionForm.action_type === 'agent') {
        const selectedStep = aiSteps.find((s) => s.id === actionForm.aiStepId);
        payload = {
          name: selectedStep?.name ?? 'AI Step',
          action_type: 'agent',
          ai_step_id: actionForm.aiStepId || null,
        };
      } else if (actionForm.action_type === 'login') {
        const selectedLogin = logins.find((l) => l.id === actionForm.loginId);
        payload = {
          name: selectedLogin?.name ?? 'Login',
          action_type: 'login',
          login_id: actionForm.loginId || null,
        };
      } else if (actionForm.action_type === 'browser_script') {
        const selectedScript = browserScripts.find((s) => s.id === actionForm.scriptId);
        payload = {
          name: selectedScript?.name ?? 'Browser Script',
          action_type: 'browser_script',
          script_id: actionForm.scriptId,
          max_retries: actionForm.maxRetries,
        };
      } else if (actionForm.action_type === 'sub_agent') {
        const selectedAgent = validSubAgents.find((a) => a.id === actionForm.targetAgentId);
        payload = {
          name: selectedAgent?.name ?? 'Sub-agent',
          action_type: 'sub_agent',
          target_agent_id: actionForm.targetAgentId,
          max_concurrent: actionForm.maxConcurrent,
          batch_size: actionForm.batchSize,
        };
      } else {
        payload = {
          name: actionForm.name.trim(),
          action_type: 'approval',
          approval_instructions: actionForm.approval_instructions.trim(),
        };
      }
      let savedActionId: string;
      if (editingAction) {
        await updateAction(selectedOrgId, agentId, editingAction.id, payload);
        savedActionId = editingAction.id;
        toast.success('Action updated');
      } else {
        const created = await createAction(selectedOrgId, agentId, payload);
        savedActionId = created?.id;
        toast.success('Action added');
      }
      // Save access groups for APPROVAL actions only (per-action gating).
      //
      // Login groups are managed per-login-profile on the login edit page —
      // they're shared across every agent that uses the login, so we show a
      // read-only summary here and deliberately skip writing from this dialog
      // to avoid clobbering changes made elsewhere.
      if (savedActionId && actionForm.action_type === 'approval') {
        await setActionAccessGroups(selectedOrgId, savedActionId, actionForm.accessGroupIds).catch((err) =>
          toast.error('Failed to save access groups: ' + (err.message ?? ''))
        );
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

  // ── Triggers ──

  const handleSaveTrigger = async () => {
    if (!selectedOrgId) return;
    try {
      setSavingTrigger(true);
      const config: Record<string, unknown> = {};
      if (triggerForm.trigger_type === 'cron') config.cron_expr = triggerForm.cron_expr;
      if (triggerForm.description) config.description = triggerForm.description;
      const trigger = await createTrigger(selectedOrgId, agentId, { trigger_type: triggerForm.trigger_type, trigger_config: config });
      toast.success('Trigger created');
      setTriggerDialogOpen(false);
      await loadAll();
      if (trigger.trigger_type === 'webhook') {
        const keyResult = await generateWebhookKey(selectedOrgId, agentId, trigger.id);
        setNewRawKey(keyResult.key);
        await loadWebhookKey(trigger.id);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create trigger');
    } finally {
      setSavingTrigger(false);
    }
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    if (!selectedOrgId) return;
    const deletedTrigger = triggers.find(t => t.id === triggerId);
    const confirmed = await confirm({ title: 'Remove Trigger', description: 'Remove this trigger? The agent will fall back to Manual Only.', confirmText: 'Remove', cancelText: 'Cancel', variant: 'destructive' });
    if (!confirmed) return;
    try {
      await deleteTrigger(selectedOrgId, agentId, triggerId);
      if (deletedTrigger?.trigger_type !== 'manual') {
        await createTrigger(selectedOrgId, agentId, { trigger_type: 'manual' });
      }
      toast.success('Trigger removed — defaulted to Manual Only');
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove trigger');
    }
  };

  const handleGenerateKey = async (triggerId: string) => {
    if (!selectedOrgId) return;
    try {
      const result = await generateWebhookKey(selectedOrgId, agentId, triggerId);
      setNewRawKey(result.key);
      await loadWebhookKey(triggerId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate key');
    }
  };

  // ── Settings ──

  const handleSaveSettings = async () => {
    if (!selectedOrgId) return;
    try {
      setSavingSettings(true);
      await updateAgent(selectedOrgId, agentId, { name: agentName.trim(), description: agentDesc.trim() || undefined, is_active: agentActive, requires_browser: agentRequiresBrowser });
      toast.success('Agent updated');
      setSettingsDirty(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update agent');
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Computed ──

  const triggerIcon = { webhook: <Webhook className="h-4 w-4" />, cron: <Clock className="h-4 w-4" />, manual: <Play className="h-4 w-4" /> };
  const triggerLabel = { webhook: 'Webhook', cron: 'Cron Schedule', manual: 'Manual Only' };
  const trigger = triggers.find(t => t.trigger_type !== 'manual') ?? triggers.find(t => t.trigger_type === 'manual') ?? null;

  /** Append a template token to a form field (used by VariableChips). */
  const insertToken = (field: 'approval_instructions', token: string) => {
    setActionForm((f) => ({ ...f, [field]: `${f[field] ?? ''}${token}` }));
  };

  /**
   * Variables available to the currently-edited action.
   * Walks the ordered actions list up to the edited action's position and
   * collects variable names from prior browser_script parameters. After an
   * `agent` action we expose a generic `output` hint since keys depend on
   * what the LLM returns.
   */
  const availableVars = useMemo(() => {
    if (!editingAction) {
      // New action — available = everything produced by all existing actions
      const all: string[] = [];
      for (const a of actions) {
        if (a.action_type === 'browser_script' && a.script_id) {
          const script = browserScripts.find((s) => s.id === a.script_id);
          if (script?.parameters) all.push(...Object.keys(script.parameters));
        }
      }
      return Array.from(new Set(all));
    }
    const idx = actions.findIndex((a) => a.id === editingAction.id);
    const prior = idx >= 0 ? actions.slice(0, idx) : actions;
    const names: string[] = [];
    for (const a of prior) {
      if (a.action_type === 'browser_script' && a.script_id) {
        const script = browserScripts.find((s) => s.id === a.script_id);
        if (script?.parameters) names.push(...Object.keys(script.parameters));
      }
    }
    return Array.from(new Set(names));
  }, [actions, editingAction, browserScripts]);

  const handleDropAction = async (dropIdx: number) => {
    if (dragIndex === null || dragIndex === dropIdx) return;
    const newActions = [...actions];
    const [dragged] = newActions.splice(dragIndex, 1);
    newActions.splice(dropIdx, 0, dragged!);
    setActions(newActions);
    setDragIndex(null);
    setDropIndex(null);
    try {
      await reorderActions(selectedOrgId!, agentId, newActions.map((a) => a.id));
    } catch {
      toast.error('Reorder failed');
      await loadAll();
    }
  };

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/agents')} className="shrink-0 mt-0.5">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{agent.name}</h1>
            <Badge variant={agent.is_active ? 'default' : 'secondary'}>{agent.is_active ? 'Active' : 'Inactive'}</Badge>
            {agent.requires_browser && (
              <Badge variant="outline" className="gap-1 border-info/40 text-info">
                <Monitor className="h-3 w-3" />Browser
              </Badge>
            )}
          </div>
          {agent.description && <p className="text-sm text-muted-foreground mt-0.5">{agent.description}</p>}
        </div>

        {/* Quick links */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/approvals?agent_id=${agentId}`}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-orange-500" />
            View Approvals
            {pendingHitlCount > 0 && (
              <Badge variant="destructive" className="ml-0.5 h-4 px-1 text-xs">{pendingHitlCount}</Badge>
            )}
          </Link>
          <Link
            href={`/agent-history?agent_id=${agentId}`}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
          >
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            History
          </Link>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <Tabs defaultValue="workflow">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="workflow">
            <GitBranch className="h-4 w-4 mr-2" />
            Workflow
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* ── Workflow Tab ──────────────────────────────────── */}
        <TabsContent value="workflow" className="mt-4">
          <div className="max-w-2xl space-y-0">

            {/* Trigger */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">Trigger</p>
              {trigger ? (
                <Card className="border-brand/40 bg-brand/5 dark:bg-brand/10">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-brand/15 text-brand mt-0.5 shrink-0">
                        {triggerIcon[trigger.trigger_type as keyof typeof triggerIcon]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{triggerLabel[trigger.trigger_type as keyof typeof triggerLabel]}</span>
                        </div>
                        {trigger.trigger_type === 'manual' && (
                          <div className="mt-1.5 space-y-2">
                            <p className="text-xs text-muted-foreground">This agent can only be run manually. Add a Webhook or Cron trigger to also automate runs.</p>
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => setTriggerDialogOpen(true)}>
                              <Plus className="mr-1.5 h-3 w-3" />Add Webhook or Cron trigger
                            </Button>
                          </div>
                        )}
                        {trigger.trigger_type === 'cron' && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                            <code className="bg-background border px-1.5 py-0.5 rounded font-mono">{String(trigger.trigger_config.cron_expr ?? '')}</code>
                            <span>{describeCron(String(trigger.trigger_config.cron_expr ?? ''))}</span>
                          </p>
                        )}
                        {trigger.trigger_type === 'webhook' && (
                          <div className="mt-2 space-y-3">
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-background border px-2 py-1 rounded flex-1 truncate font-mono">
                                {`https://api.wazzi.io/webhooks/agents/${trigger.id}`}
                              </code>
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(`https://api.wazzi.io/webhooks/agents/${trigger.id}`); toast.success('URL copied'); }}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="rounded-md bg-muted/60 border px-3 py-2 space-y-1.5">
                              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">How to trigger</p>
                              <pre className="text-xs text-foreground whitespace-pre-wrap break-all leading-relaxed">{`POST https://api.wazzi.io/webhooks/agents/${trigger.id}\nX-Wazzi-Key: <your-api-key>`}</pre>
                              <p className="text-xs text-muted-foreground">Optionally pass a JSON body — it will be available as the initial input to the first action.</p>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">API Key</p>
                              <div className="flex items-center gap-2 text-xs">
                                <code className="bg-background border px-2 py-1 rounded font-mono flex-1">
                                  {webhookKey ? <>{webhookKey.key_prefix}… <span className="text-muted-foreground">(created {new Date(webhookKey.created_at).toLocaleDateString()})</span></> : <span className="text-muted-foreground">Loading…</span>}
                                </code>
                                <Button variant="outline" size="sm" className="h-6 text-xs px-2 shrink-0" onClick={() => handleGenerateKey(trigger.id)}>
                                  <RefreshCw className="mr-1 h-3 w-3" />Regenerate
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {trigger.trigger_type !== 'manual' && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => handleDeleteTrigger(trigger.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed border-2 border-brand/30 hover:border-brand/50 transition-colors">
                  <CardContent className="py-6 flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-muted">
                      <Play className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">No trigger set</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Choose how this agent is initiated</p>
                    </div>
                    <Button size="sm" onClick={() => setTriggerDialogOpen(true)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Select Trigger
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Connector line */}
            <div className="flex justify-center py-1">
              <div className="flex flex-col items-center">
                <div className="w-px h-5 bg-border" />
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground -mt-px" />
              </div>
            </div>

            {/* Steps */}
            <div>
              <div className="mb-2 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Steps</p>
              </div>

              <div>
                {actions.map((action, idx) => (
                  <div key={action.id}>
                    <Card
                      className={cn(
                        'group transition-all duration-150 cursor-pointer',
                        dragIndex === idx && 'opacity-40 scale-[0.98]',
                        dropIndex === idx && dragIndex !== idx && 'ring-2 ring-primary ring-offset-1',
                      )}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => { e.preventDefault(); setDropIndex(idx); }}
                      onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                      onDrop={() => handleDropAction(idx)}
                      onClick={() => openEditAction(action)}
                    >
                      <CardContent className="py-2.5 px-3">
                        <div className="flex items-center gap-3">
                          <div className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold select-none',
                            action.action_type === 'approval'
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                              : action.action_type === 'login'
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                              : action.action_type === 'browser_script'
                              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                              : action.action_type === 'sub_agent'
                              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                              : 'bg-brand/10 text-brand'
                          )}>
                            {action.action_type === 'login' ? <LogIn className="h-3.5 w-3.5" />
                              : action.action_type === 'browser_script' ? <CircleDot className="h-3.5 w-3.5" />
                              : action.action_type === 'sub_agent' ? <GitBranch className="h-3.5 w-3.5" />
                              : action.action_type === 'approval' ? <CheckCircle2 className="h-3.5 w-3.5" />
                              : idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{action.name}</span>
                              <Badge
                                variant={action.action_type === 'agent' ? 'secondary' : 'outline'}
                                className={cn('text-xs',
                                  action.action_type === 'approval' && 'border-orange-400 text-orange-600',
                                  action.action_type === 'login' && 'border-info/40 text-info',
                                  action.action_type === 'browser_script' && 'border-brand/40 text-brand',
                                  action.action_type === 'sub_agent' && 'border-brand/40 text-brand',
                                )}
                              >
                                {action.action_type === 'approval' ? 'Human Review'
                                  : action.action_type === 'login' ? 'Browser Login'
                                  : action.action_type === 'browser_script' ? 'Browser Script'
                                  : action.action_type === 'sub_agent' ? 'Run Agent'
                                  : 'AI Step'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {action.action_type === 'login'
                                ? `→ ${action.login_name ?? '(no login selected)'}`
                                : action.action_type === 'agent'
                                ? `→ ${action.ai_step_name ?? '(no AI step selected)'}`
                                : action.action_type === 'browser_script'
                                ? `→ ${action.script_name ?? '(no script selected)'}${(action.max_retries ?? 0) > 0 ? ` · ${action.max_retries} ${action.max_retries === 1 ? 'retry' : 'retries'}` : ''}`
                                : action.action_type === 'sub_agent'
                                ? `→ ${action.target_agent_name ?? 'Unknown agent'}${(action.batch_size ?? 1) > 1 ? ` · batch ${action.batch_size}` : ''} · ×${action.max_concurrent ?? 3} concurrent`
                                : (action.approval_instructions ?? '—')}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); handleDeleteAction(action.id, action.name); }}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <div className="flex justify-center py-1">
                      <div className="w-px h-4 bg-border" />
                    </div>
                  </div>
                ))}

                {/* Add Step card */}
                <button
                  type="button"
                  className="w-full"
                  onClick={() => setActionTypeModalOpen(true)}
                >
                  <Card className="border-dashed border-2 hover:border-brand/50 hover:bg-muted/20 transition-colors cursor-pointer">
                    <CardContent className="py-4 flex items-center justify-center gap-2">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground font-medium">Add Step</span>
                    </CardContent>
                  </Card>
                </button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Settings Tab ──────────────────────────────────── */}
        <TabsContent value="settings" className="mt-4">
          <div className="max-w-md space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-name">Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="agent-name"
                    value={agentName}
                    onChange={(e) => { setAgentName(e.target.value); setSettingsDirty(true); }}
                    placeholder="Agent name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agent-desc">Description</Label>
                  <Textarea
                    id="agent-desc"
                    value={agentDesc}
                    onChange={(e) => { setAgentDesc(e.target.value); setSettingsDirty(true); }}
                    placeholder="Optional description…"
                    rows={3}
                  />
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-xs text-muted-foreground">
                      {agentActive ? 'Agent is active and will run triggers' : 'Agent is inactive and will not run'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAgentActive((v) => !v); setSettingsDirty(true); }}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                      agentActive ? 'bg-brand' : 'bg-muted-foreground/30'
                    )}
                  >
                    <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', agentActive ? 'translate-x-5' : 'translate-x-0.5')} />
                  </button>
                </div>

                {/* Browser toggle */}
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-sky-500" />Requires Browser
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {agentRequiresBrowser ? 'Browser tools available to all actions in this agent' : 'No browser — enable to use browser tools or login steps'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAgentRequiresBrowser((v) => !v); setSettingsDirty(true); }}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                      agentRequiresBrowser ? 'bg-sky-500' : 'bg-muted-foreground/30'
                    )}
                  >
                    <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', agentRequiresBrowser ? 'translate-x-5' : 'translate-x-0.5')} />
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    onClick={handleSaveSettings}
                    disabled={!settingsDirty || !agentName.trim() || savingSettings}
                  >
                    {savingSettings ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      {/* ── Action Dialog ─────────────────────────────────────── */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAction ? 'Edit' : 'Add'}{' '}
              {actionForm.action_type === 'approval' ? 'Human Review'
                : actionForm.action_type === 'login' ? 'Browser Login'
                : actionForm.action_type === 'browser_script' ? 'Browser Script'
                : actionForm.action_type === 'sub_agent' ? 'Run Agent'
                : 'AI Step'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {actionForm.action_type === 'approval' && (
              <div className="space-y-1">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input placeholder="Action name" value={actionForm.name} onChange={(e) => setActionForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            )}

            {actionForm.action_type === 'agent' && (
              <>
                <div className="space-y-1">
                  <Label>AI Step <span className="text-destructive">*</span></Label>
                  <Select value={actionForm.aiStepId} onValueChange={(v) => setActionForm(f => ({ ...f, aiStepId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select an AI step…" /></SelectTrigger>
                    <SelectContent>
                      {aiSteps.length === 0 ? (
                        <SelectItem value="_none" disabled>No AI steps yet — create one first</SelectItem>
                      ) : (
                        aiSteps.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <EntityPreviewNotice
                  entityLabel="AI step"
                  editHref={actionForm.aiStepId ? `/actions/ai-steps/${actionForm.aiStepId}` : '/actions/ai-steps'}
                  editLabel="AI Steps"
                />
                {(() => {
                  const selected = aiSteps.find((s) => s.id === actionForm.aiStepId);
                  return selected ? (
                    <AiStepPreview
                      step={selected}
                      connectors={connectors.filter((c) => c.agent_enabled).map((c) => ({ id: c.id, label: (c as unknown as { connector_name?: string }).connector_name ?? c.id }))}
                      skills={skills}
                      availableVars={availableVars}
                    />
                  ) : null;
                })()}
              </>
            )}

            {actionForm.action_type === 'login' && (
              <>
                <EntityPreviewNotice
                  entityLabel="login profile"
                  editHref={actionForm.loginId ? `/actions/logins/${actionForm.loginId}` : '/actions/logins'}
                  editLabel="Logins"
                />
                <div className="space-y-1">
                  <Label>Login Profile <span className="text-destructive">*</span></Label>
                  <Select value={actionForm.loginId} onValueChange={(v) => setActionForm(f => ({ ...f, loginId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select a login profile…" /></SelectTrigger>
                    <SelectContent>
                      {logins.length === 0 ? (
                        <SelectItem value="_none" disabled>No logins yet — create one first</SelectItem>
                      ) : (
                        logins.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {(() => {
                  const selected = logins.find((l) => l.id === actionForm.loginId);
                  return selected ? <LoginPreview login={selected} availableVars={availableVars} /> : null;
                })()}

                {/* Access groups — read-only summary.  Login groups are managed
                    per-login-profile (not per-action) so they stay in sync
                    across every agent that uses this login.  Edit them on
                    the login profile page. */}
                {actionForm.loginId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Login Access Groups</Label>
                      <Link
                        href={`/actions/logins/${actionForm.loginId}`}
                        className="text-xs text-brand hover:underline"
                      >
                        Edit on login profile →
                      </Link>
                    </div>
                    {actionForm.accessGroupIds.length === 0 ? (
                      <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                        <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          <strong>Open to everyone.</strong> With no groups assigned to this login profile, any user with Agent Center access in this organization can complete the login when the agent pauses.
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                        <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          <strong>Restricted.</strong> Only members of the {actionForm.accessGroupIds.length === 1 ? 'assigned group' : `${actionForm.accessGroupIds.length} assigned groups`} can complete this login. Applies to every agent using this login profile.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {actionForm.action_type === 'approval' && (
              <>
                <div className="space-y-1">
                  <Label>Instructions for Approver</Label>
                  <Textarea placeholder="Describe what the approver needs to review and decide…" value={actionForm.approval_instructions} onChange={(e) => setActionForm(f => ({ ...f, approval_instructions: e.target.value }))} rows={4} className="text-sm" />
                  <VariableChips vars={availableVars} onInsert={(t) => insertToken('approval_instructions', t)} />
                </div>
                <ApprovalPreview
                  instructions={actionForm.approval_instructions}
                  availableVars={availableVars}
                />
                {/* Access groups — who can approve */}
                <div className="space-y-2">
                  <Label>Approval Groups</Label>
                  <MultiSelectTags
                    options={allGroups.map((g) => ({ value: g.id, label: `${g.name} (${g.member_count})` }))}
                    selected={actionForm.accessGroupIds}
                    onChange={(ids) => setActionForm((f) => ({ ...f, accessGroupIds: ids }))}
                    placeholder="Select access groups…"
                  />
                  {actionForm.accessGroupIds.length === 0 ? (
                    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                      <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>Open to everyone.</strong> With no groups selected, any user with Agent Center access in this organization will see and be able to approve this step. Add one or more groups to restrict approvals.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                      <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>Restricted.</strong> Only members of the {actionForm.accessGroupIds.length === 1 ? 'selected group' : `${actionForm.accessGroupIds.length} selected groups`} will see and be able to approve this step.
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {actionForm.action_type === 'browser_script' && (
              <>
                <EntityPreviewNotice
                  entityLabel="browser script"
                  editHref="/actions/browser-scripts"
                  editLabel="Browser Scripts"
                />
                <div className="space-y-1">
                  <Label>Script <span className="text-destructive">*</span></Label>
                  <Select value={actionForm.scriptId} onValueChange={(v) => setActionForm(f => ({ ...f, scriptId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a browser script…" />
                    </SelectTrigger>
                    <SelectContent>
                      {browserScripts.length === 0 ? (
                        <SelectItem value="_none" disabled>No scripts available</SelectItem>
                      ) : (
                        browserScripts.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {(() => {
                  const selected = browserScripts.find((s) => s.id === actionForm.scriptId);
                  return selected ? (
                    <BrowserScriptPreview script={selected} availableVars={availableVars} />
                  ) : null;
                })()}

                {/* Retry config */}
                <div className="space-y-1">
                  <Label>Retries on Failure</Label>
                  <Select
                    value={String(actionForm.maxRetries)}
                    onValueChange={(v) => setActionForm(f => ({ ...f, maxRetries: parseInt(v) }))}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No retries</SelectItem>
                      <SelectItem value="1">1 retry</SelectItem>
                      <SelectItem value="2">2 retries</SelectItem>
                      <SelectItem value="3">3 retries</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Failed items will be retried up to this many times. Each retry re-runs the <strong>entire script from the beginning</strong> for that item.
                  </p>
                  {actionForm.maxRetries > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>Use caution with scripts that perform submissions or create records — a retry will re-execute those actions and may cause duplicates.</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {actionForm.action_type === 'sub_agent' && (
              <>
                <div className="space-y-1">
                  <Label>Target Agent <span className="text-destructive">*</span></Label>
                  <Select value={actionForm.targetAgentId} onValueChange={(v) => setActionForm(f => ({ ...f, targetAgentId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an agent to run as sub-agent…" />
                    </SelectTrigger>
                    <SelectContent>
                      {validSubAgents.length === 0 ? (
                        <SelectItem value="_none" disabled>No other agents available</SelectItem>
                      ) : (
                        validSubAgents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Only agents without their own sub-agent actions are shown. Nesting is limited to one level.
                  </p>
                </div>
                <EntityPreviewNotice
                  entityLabel="sub-agent"
                  editHref="/agents"
                  editLabel="Agents"
                  bodyOverride="This action runs another agent's workflow as a sub-agent. Batch size and max concurrent below are configurable per-action; the target agent's own configuration is managed separately."
                />
                <InfoBlock>
                  <p>The previous step must output a JSON array. Items are grouped into batches and each batch is sent to a sub-agent invocation. All item data and parent context are available as {'{{variables}}'} in prompts and browser scripts.</p>
                  <p><strong>How batch processing works:</strong> Inside the sub-agent, AI steps and browser scripts loop through each item in the batch sequentially. Login and approval steps run once and are shared across all items. Each item&apos;s output feeds into the next step for that same item.</p>
                  <p><strong>Speed tip:</strong> For maximum parallelization, keep batch size at 1 and increase max concurrent. This runs many sub-agents in parallel. Larger batch sizes are useful when you want to reuse a single browser session (e.g. one login) across multiple items.</p>
                </InfoBlock>
                {(() => {
                  const selected = validSubAgents.find((a) => a.id === actionForm.targetAgentId);
                  return selected ? <SubAgentPreview agent={selected} /> : null;
                })()}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5">
                      Batch Size
                      <span className="text-xs font-normal text-muted-foreground" title="Number of items from the input array to send per sub-agent invocation.">(i)</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={actionForm.batchSize}
                      onChange={(e) => setActionForm(f => ({ ...f, batchSize: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-24"
                    />
                    <p className="text-xs text-muted-foreground">
                      Items per sub-agent call. Default 1 sends one item at a time.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5">
                      Max Concurrent
                      <span className="text-xs font-normal text-muted-foreground" title="Higher concurrency uses more browser slots. Balance with other agents that may need capacity.">(i)</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={actionForm.maxConcurrent}
                      onChange={(e) => setActionForm(f => ({ ...f, maxConcurrent: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) }))}
                      className="w-24"
                    />
                    <p className="text-xs text-muted-foreground">
                      How many sub-agents to run in parallel.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveAction}
              disabled={
                savingAction ||
                (actionForm.action_type === 'approval' && !actionForm.name.trim()) ||
                (actionForm.action_type === 'agent' && !actionForm.aiStepId) ||
                (actionForm.action_type === 'login' && !actionForm.loginId) ||
                (actionForm.action_type === 'browser_script' && !actionForm.scriptId) ||
                (actionForm.action_type === 'sub_agent' && !actionForm.targetAgentId)
              }
            >
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTriggerDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTrigger} disabled={savingTrigger}>
              {savingTrigger ? 'Creating…' : 'Create Trigger'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Step Type Modal ──────────────────────────────── */}
      <Dialog open={actionTypeModalOpen} onOpenChange={setActionTypeModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Step</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-1">
            {/* AI Step */}
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
              onClick={() => { setActionTypeModalOpen(false); openNewAction('agent'); }}
            >
              <div className="p-2 rounded-lg bg-brand/10 shrink-0">
                <PlayCircle className="h-4 w-4 text-brand" />
              </div>
              <div>
                <p className="font-medium text-sm">AI Step</p>
                <p className="text-xs text-muted-foreground">Run an AI model to process, generate, or analyze data</p>
              </div>
            </button>

            {/* Human Review */}
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
              onClick={() => { setActionTypeModalOpen(false); openNewAction('approval'); }}
            >
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="font-medium text-sm">Human Review</p>
                <p className="text-xs text-muted-foreground">Pause for a human to review and approve before continuing</p>
              </div>
            </button>

            {/* Run Agent — disabled if this agent is used as a sub-agent elsewhere (nesting limited to one level) */}
            {(() => {
              const usedBy = agent?.used_as_sub_agent_by ?? [];
              const disabled = usedBy.length > 0;
              return (
                <button
                  type="button"
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50'}`}
                  onClick={() => { if (!disabled) { setActionTypeModalOpen(false); openNewAction('sub_agent'); } }}
                  disabled={disabled}
                >
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 shrink-0">
                    <GitBranch className="h-4 w-4 text-brand" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Run Agent</p>
                    {disabled ? (
                      <p className="text-xs text-destructive">
                        Used as a sub-agent by {usedBy.map((u) => u.name).join(', ')} — nesting is limited to one level
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Run another agent once for each item in a list</p>
                    )}
                  </div>
                </button>
              );
            })()}

            {/* Browser steps — gated on requires_browser */}
            {agentRequiresBrowser ? (
              <>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => { setActionTypeModalOpen(false); openNewAction('login'); }}
                >
                  <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30 shrink-0">
                    <LogIn className="h-4 w-4 text-info" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Browser Login</p>
                    <p className="text-xs text-muted-foreground">Verify browser login before running browser steps</p>
                  </div>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => { setActionTypeModalOpen(false); openNewAction('browser_script'); }}
                >
                  <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                    <CircleDot className="h-4 w-4 text-brand" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Browser Script</p>
                    <p className="text-xs text-muted-foreground">Execute a recorded browser automation script</p>
                  </div>
                </button>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-3 space-y-2.5 mt-0.5">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-sky-500 shrink-0" />
                  <p className="text-sm font-medium">Browser Steps</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong>Browser Login</strong> and <strong>Browser Script</strong> steps require browser mode to be enabled for this agent. Enable it below, then add browser steps.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-info/40 text-info hover:bg-info-soft hover:border-info/60"
                  onClick={async () => {
                    if (!selectedOrgId) return;
                    try {
                      await updateAgent(selectedOrgId, agentId, { requires_browser: true });
                      setAgentRequiresBrowser(true);
                      toast.success('Browser enabled');
                    } catch {
                      toast.error('Failed to enable browser');
                    }
                  }}
                >
                  <Monitor className="mr-1.5 h-3.5 w-3.5" />Enable Browser
                </Button>
                <div className="flex gap-2 opacity-40 pointer-events-none pt-0.5">
                  <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 flex-1">
                    <LogIn className="h-3.5 w-3.5 text-sky-500" />
                    <span className="text-xs">Browser Login</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 flex-1">
                    <CircleDot className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-xs">Browser Script</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Raw Key Reveal Dialog ─────────────────────────────── */}
      <Dialog open={!!newRawKey} onOpenChange={(o) => { if (!o) setNewRawKey(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>API Key Generated</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-orange-50 border border-orange-200 p-3 text-sm text-orange-600 font-medium dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-400">
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
