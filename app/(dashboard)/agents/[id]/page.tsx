'use client';

import { use, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  getAgentAccessGroups,
  getAssignedAccessGroups,
  getAgentGroupMembers,
  assignAccessGroupToAgent,
  unassignAccessGroupFromAgent,
  type AgentAccessGroup,
  type AgentAccessGroupMember,
} from '@/lib/api/agent-access-groups';
import type { OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Pencil, Trash2, Copy, RefreshCw, ArrowDown, GripVertical,
  Webhook, Clock, Play, History, CheckCircle2, PlayCircle, X, Search, Monitor,
  LogIn, ShieldCheck, ExternalLink, GitBranch, Settings, Users, CircleDot,
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

// ─── Multi-select picker ──────────────────────────────────────

interface PickerOption { id: string; label: string; subLabel?: string }

function MultiSelectPicker({
  label,
  description,
  addLabel,
  options,
  selectedIds,
  onAdd,
  onRemove,
  pillClass,
}: {
  label: string;
  description?: string;
  addLabel: string;
  options: PickerOption[];
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  pillClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = options.filter((o) => selectedIds.includes(o.id));
  const unselected = options.filter((o) => !selectedIds.includes(o.id));
  const filtered = unselected.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.subLabel ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const pillBase = 'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium';

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <div className="flex flex-wrap gap-1.5 items-center">
        {selected.map((item) => (
          <span key={item.id} className={cn(pillBase, pillClass ?? 'bg-secondary text-secondary-foreground border-border')}>
            {item.label}
            <button type="button" onClick={() => onRemove(item.id)} className="rounded-sm opacity-60 hover:opacity-100 transition-opacity">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {unselected.length > 0 && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(pillBase, 'border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors cursor-pointer bg-transparent')}
          >
            <Plus className="h-3 w-3" />{addLabel}
          </button>
        )}

        {options.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No {label.toLowerCase()} available.</p>
        )}
      </div>

      {open && (
        <div className="rounded-md border shadow-sm bg-background">
          <div className="flex items-center border-b px-2 gap-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setSearch(''); } }}
              className="flex-1 bg-transparent py-2 text-xs outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={() => { setOpen(false); setSearch(''); }}>
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-muted-foreground">No matches</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-baseline gap-1.5"
                  onClick={() => {
                    onAdd(item.id);
                    setSearch('');
                    if (filtered.length <= 1) { setOpen(false); }
                  }}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.subLabel && <span className="text-muted-foreground truncate">{item.subLabel}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User avatar ──────────────────────────────────────────────

function UserAvatar({ firstName, lastName, email }: { firstName: string | null; lastName: string | null; email: string }) {
  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`
    : firstName
    ? firstName[0]!
    : email[0]!;
  return (
    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0 select-none">
      {initials.toUpperCase()}
    </div>
  );
}

// Group badge colors (cycled by index)
const GROUP_BADGE_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400',
  'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-400',
  'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400',
  'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400',
  'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400',
];

// ─── Main Component ───────────────────────────────────────────

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: agentId } = use(params);
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const { confirm } = useConfirmDialog();

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
  const [actionForm, setActionForm] = useState({ name: '', action_type: 'agent' as 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent', prompt: '', model: 'claude-sonnet-4-6', connector_ids: [] as string[], skill_ids: [] as string[], approval_instructions: '', loginUrl: '', loginVerify: '', scriptId: '', scriptParams: {} as Record<string, string>, targetAgentId: '', inputField: '', maxConcurrent: 3 });
  const [validSubAgents, setValidSubAgents] = useState<Agent[]>([]);
  const [savingAction, setSavingAction] = useState(false);

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

  // Access groups
  const [assignedGroups, setAssignedGroups] = useState<AgentAccessGroup[]>([]);
  const [allGroups, setAllGroups] = useState<AgentAccessGroup[]>([]);

  // Approvers tab — group members loaded lazily
  const [groupMembers, setGroupMembers] = useState<Record<string, AgentAccessGroupMember[]>>({});
  const [membersLoading, setMembersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('workflow');

  useEffect(() => {
    if (selectedOrgId && agentId) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, agentId]);

  const loadAll = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      let [agentData, actionsData, connData, hitlData, skillsData, assignedGroupsData, allGroupsData, scriptsData] = await Promise.all([
        getAgent(selectedOrgId, agentId),
        getActions(selectedOrgId, agentId),
        getConnectors(selectedOrgId),
        getApprovals(selectedOrgId),
        getSkills(selectedOrgId),
        getAssignedAccessGroups(selectedOrgId, agentId),
        getAgentAccessGroups(selectedOrgId),
        listScripts(selectedOrgId),
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
      setAssignedGroups(assignedGroupsData);
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

  // Load members for all assigned groups (used by Approvers tab)
  const loadGroupMembers = useCallback(async (groups: AgentAccessGroup[]) => {
    if (!selectedOrgId || groups.length === 0) { setGroupMembers({}); return; }
    setMembersLoading(true);
    try {
      const results = await Promise.all(
        groups.map(async (g) => ({ groupId: g.id, members: await getAgentGroupMembers(selectedOrgId, g.id) }))
      );
      const map: Record<string, AgentAccessGroupMember[]> = {};
      for (const { groupId, members } of results) map[groupId] = members;
      setGroupMembers(map);
    } catch {
      toast.error('Failed to load group members');
    } finally {
      setMembersLoading(false);
    }
  }, [selectedOrgId]);

  // Trigger member load when switching to approvers tab
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'approvers') loadGroupMembers(assignedGroups);
  };

  // Reload members after group assignment changes on the approvers tab
  useEffect(() => {
    if (activeTab === 'approvers') loadGroupMembers(assignedGroups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedGroups]);

  // ── Actions ──

  const openNewAction = (type: 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent') => {
    setEditingAction(null);
    setActionForm({ name: '', action_type: type, prompt: '', model: 'claude-sonnet-4-6', connector_ids: [], skill_ids: [], approval_instructions: '', loginUrl: '', loginVerify: '', scriptId: '', scriptParams: {}, targetAgentId: '', inputField: '', maxConcurrent: 3 });
    // Load valid sub-agents when opening a sub_agent form
    if (type === 'sub_agent' && selectedOrgId) {
      getValidSubAgents(selectedOrgId, agentId).then(setValidSubAgents).catch(() => {});
    }
    setActionDialogOpen(true);
  };

  const openEditAction = (action: AgentAction) => {
    setEditingAction(action);
    let loginUrl = '';
    let loginVerify = '';
    if (action.action_type === 'login' && action.prompt) {
      try {
        const parsed = JSON.parse(action.prompt);
        loginUrl = parsed.url ?? '';
        loginVerify = parsed.verify ?? '';
      } catch { /* leave empty */ }
    }
    setActionForm({
      name: action.name,
      action_type: action.action_type,
      prompt: action.action_type === 'login' ? '' : (action.prompt ?? ''),
      model: action.model ?? 'claude-sonnet-4-6',
      connector_ids: action.connector_ids ?? [],
      skill_ids: action.skill_ids ?? [],
      approval_instructions: action.approval_instructions ?? '',
      loginUrl,
      loginVerify,
      scriptId: action.script_id ?? '',
      scriptParams: (action.script_params as Record<string, string>) ?? {},
      targetAgentId: action.target_agent_id ?? '',
      inputField: action.input_field ?? '',
      maxConcurrent: action.max_concurrent ?? 3,
    });
    // Load valid sub-agents when editing a sub_agent action
    if (action.action_type === 'sub_agent' && selectedOrgId) {
      getValidSubAgents(selectedOrgId, agentId).then(setValidSubAgents).catch(() => {});
    }
    setActionDialogOpen(true);
  };

  const handleSaveAction = async () => {
    if (!selectedOrgId || !actionForm.name.trim()) return;
    try {
      setSavingAction(true);
      const validConnectorIds = new Set(connectors.map((c) => c.id));
      const validSkillIds = new Set(skills.map((s) => s.id));

      let payload: Record<string, unknown>;
      if (actionForm.action_type === 'agent') {
        payload = {
          name: actionForm.name.trim(),
          action_type: 'agent',
          prompt: actionForm.prompt.trim(),
          model: actionForm.model,
          connector_ids: actionForm.connector_ids.filter((id) => validConnectorIds.has(id)),
          skill_ids: actionForm.skill_ids.filter((id) => validSkillIds.has(id)),
        };
      } else if (actionForm.action_type === 'login') {
        payload = {
          name: actionForm.name.trim(),
          action_type: 'login',
          prompt: JSON.stringify({ url: actionForm.loginUrl.trim(), verify: actionForm.loginVerify.trim() }),
          model: actionForm.model,
        };
      } else if (actionForm.action_type === 'browser_script') {
        payload = {
          name: actionForm.name.trim(),
          action_type: 'browser_script',
          script_id: actionForm.scriptId,
          script_params: actionForm.scriptParams,
        };
      } else if (actionForm.action_type === 'sub_agent') {
        payload = {
          name: actionForm.name.trim(),
          action_type: 'sub_agent',
          target_agent_id: actionForm.targetAgentId,
          input_field: actionForm.inputField.trim() || null,
          max_concurrent: actionForm.maxConcurrent,
        };
      } else {
        payload = {
          name: actionForm.name.trim(),
          action_type: 'approval',
          approval_instructions: actionForm.approval_instructions.trim(),
        };
      }
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

  // Build user → groups mapping for Approvers tab
  const authorizedUsers = useMemo(() => {
    const map = new Map<string, { user: AgentAccessGroupMember; groups: Array<{ group: AgentAccessGroup; colorClass: string }> }>();
    assignedGroups.forEach((group, groupIdx) => {
      const colorClass = GROUP_BADGE_COLORS[groupIdx % GROUP_BADGE_COLORS.length]!;
      for (const member of (groupMembers[group.id] ?? [])) {
        if (!map.has(member.id)) map.set(member.id, { user: member, groups: [] });
        map.get(member.id)!.groups.push({ group, colorClass });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const nameA = [a.user.first_name, a.user.last_name].filter(Boolean).join(' ') || a.user.email;
      const nameB = [b.user.first_name, b.user.last_name].filter(Boolean).join(' ') || b.user.email;
      return nameA.localeCompare(nameB);
    });
  }, [assignedGroups, groupMembers]);

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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              <Badge variant="outline" className="gap-1 border-sky-400 text-sky-600 dark:text-sky-400">
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
      <Tabs defaultValue="workflow" onValueChange={handleTabChange}>
        <TabsList className="grid w-full max-w-sm grid-cols-3">
          <TabsTrigger value="workflow">
            <GitBranch className="h-4 w-4 mr-2" />
            Workflow
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="approvers">
            <Users className="h-4 w-4 mr-2" />
            Approvers
          </TabsTrigger>
        </TabsList>

        {/* ── Workflow Tab ──────────────────────────────────── */}
        <TabsContent value="workflow" className="mt-4">
          <div className="max-w-2xl space-y-0">

            {/* Trigger */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">Trigger</p>
              {trigger ? (
                <Card className="border-primary/40 bg-primary/5 dark:bg-primary/10">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/15 text-primary mt-0.5 shrink-0">
                        {triggerIcon[trigger.trigger_type as keyof typeof triggerIcon]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{triggerLabel[trigger.trigger_type as keyof typeof triggerLabel]}</span>
                        </div>
                        {trigger.trigger_type === 'manual' && (
                          <div className="mt-1.5 space-y-2">
                            <p className="text-xs text-muted-foreground">This agent can only be run manually. Add a Webhook or Cron trigger to also automate runs.</p>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTriggerDialogOpen(true)}>
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
                <Card className="border-dashed border-2 border-primary/30 hover:border-primary/50 transition-colors">
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

            {/* Actions */}
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Actions</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Add Action
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openNewAction('agent')}>
                      <PlayCircle className="mr-2 h-4 w-4" />Agent Step
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNewAction('approval')}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />Approval
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNewAction('login')} disabled={!agentRequiresBrowser}>
                      <LogIn className="mr-2 h-4 w-4" />Login Step
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNewAction('browser_script')} disabled={!agentRequiresBrowser}>
                      <CircleDot className="mr-2 h-4 w-4" />Browser Script
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openNewAction('sub_agent')}>
                      <GitBranch className="mr-2 h-4 w-4" />Sub Agent
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {actions.length === 0 ? (
                <Card className="border-dashed border-2">
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No actions yet. Add one to build your workflow.
                  </CardContent>
                </Card>
              ) : (
                <div>
                  {actions.map((action, idx) => (
                    <div key={action.id}>
                      <Card
                        className={cn(
                          'group transition-all duration-150 cursor-default',
                          dragIndex === idx && 'opacity-40 scale-[0.98]',
                          dropIndex === idx && dragIndex !== idx && 'ring-2 ring-primary ring-offset-1',
                        )}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => { e.preventDefault(); setDropIndex(idx); }}
                        onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                        onDrop={() => handleDropAction(idx)}
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
                                : 'bg-primary/10 text-primary'
                            )}>
                              {action.action_type === 'login' ? <LogIn className="h-3.5 w-3.5" />
                                : action.action_type === 'browser_script' ? <CircleDot className="h-3.5 w-3.5" />
                                : action.action_type === 'sub_agent' ? <GitBranch className="h-3.5 w-3.5" />
                                : idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{action.name}</span>
                                <Badge
                                  variant={action.action_type === 'agent' ? 'secondary' : 'outline'}
                                  className={cn('text-xs',
                                    action.action_type === 'approval' && 'border-orange-400 text-orange-600',
                                    action.action_type === 'login' && 'border-sky-400 text-sky-600 dark:text-sky-400',
                                    action.action_type === 'browser_script' && 'border-violet-400 text-violet-600 dark:text-violet-400',
                                    action.action_type === 'sub_agent' && 'border-indigo-400 text-indigo-600 dark:text-indigo-400',
                                  )}
                                >
                                  {action.action_type === 'approval' ? 'Approval'
                                    : action.action_type === 'login' ? 'Login'
                                    : action.action_type === 'browser_script' ? 'Browser Script'
                                    : action.action_type === 'sub_agent' ? 'Sub Agent'
                                    : 'Agent'}
                                </Badge>
                                {action.action_type === 'agent' && action.connector_ids && action.connector_ids.length > 0 && (
                                  <Badge variant="outline" className="text-xs">{action.connector_ids.length} connector{action.connector_ids.length !== 1 ? 's' : ''}</Badge>
                                )}
                                {action.action_type === 'agent' && action.skill_ids && action.skill_ids.length > 0 && (
                                  <Badge variant="outline" className="text-xs border-purple-400 text-purple-600 dark:text-purple-400">{action.skill_ids.length} skill{action.skill_ids.length !== 1 ? 's' : ''}</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {action.action_type === 'login'
                                  ? (() => { try { const p = JSON.parse(action.prompt ?? '{}'); return p.url || '—'; } catch { return '—'; } })()
                                  : action.action_type === 'agent'
                                  ? (action.prompt ?? '—')
                                  : action.action_type === 'browser_script'
                                  ? (browserScripts.find((s) => s.id === action.script_id)?.name ?? action.script_id ?? '—')
                                  : action.action_type === 'sub_agent'
                                  ? `→ ${action.target_agent_name ?? 'Unknown agent'}${action.input_field ? ` (field: ${action.input_field})` : ''} ×${action.max_concurrent ?? 3} concurrent`
                                  : (action.approval_instructions ?? '—')}
                              </p>
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditAction(action)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteAction(action.id, action.name)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      {idx < actions.length - 1 && (
                        <div className="flex justify-center py-1">
                          <div className="w-px h-4 bg-border" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                      agentActive ? 'bg-primary' : 'bg-muted-foreground/30'
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

        {/* ── Approvers Tab ─────────────────────────────────── */}
        <TabsContent value="approvers" className="mt-4">
          <div className="max-w-2xl space-y-4">

            {/* Assigned groups card */}
            <Card>
              <CardContent className="pt-5 pb-4 px-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    Access Groups
                  </p>
                  <Link href="/access" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                    Manage groups
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                {assignedGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No access groups assigned. Add a group to control who can interact with login and approval steps.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {assignedGroups.map((group, idx) => {
                      const colorClass = GROUP_BADGE_COLORS[idx % GROUP_BADGE_COLORS.length]!;
                      return (
                        <span
                          key={group.id}
                          className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', colorClass)}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {group.name}
                          <span className="opacity-60">{group.member_count} member{group.member_count !== 1 ? 's' : ''}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!selectedOrgId) return;
                              try {
                                await unassignAccessGroupFromAgent(selectedOrgId, agentId, group.id);
                                setAssignedGroups((prev) => prev.filter((g) => g.id !== group.id));
                              } catch { toast.error('Failed to remove group'); }
                            }}
                            className="rounded-sm opacity-50 hover:opacity-100 transition-opacity ml-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Add group */}
                {allGroups.filter((g) => !assignedGroups.some((a) => a.id === g.id)).length > 0 && (
                  <div className={cn(assignedGroups.length > 0 && 'pt-1 border-t')}>
                    <MultiSelectPicker
                      label=""
                      addLabel="Add Access Group"
                      options={allGroups
                        .filter((g) => !assignedGroups.some((a) => a.id === g.id))
                        .map((g) => ({ id: g.id, label: g.name, subLabel: `${g.member_count} member${g.member_count !== 1 ? 's' : ''}` }))}
                      selectedIds={[]}
                      onAdd={async (groupId) => {
                        if (!selectedOrgId) return;
                        try {
                          await assignAccessGroupToAgent(selectedOrgId, agentId, groupId);
                          const group = allGroups.find((g) => g.id === groupId);
                          if (group) setAssignedGroups((prev) => [...prev, group]);
                        } catch { toast.error('Failed to assign group'); }
                      }}
                      onRemove={() => {}}
                      pillClass="hidden"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Authorized users */}
            {assignedGroups.length > 0 && (
              <Card>
                <CardContent className="pt-5 pb-4 px-4">
                  <p className="text-sm font-medium mb-3">
                    {membersLoading
                      ? 'Loading users…'
                      : `${authorizedUsers.length} authorized user${authorizedUsers.length !== 1 ? 's' : ''}`}
                  </p>

                  {membersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : authorizedUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      None of the assigned groups have members yet.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {authorizedUsers.map(({ user, groups }) => {
                        const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ');
                        return (
                          <div key={user.id} className="flex items-center gap-3 py-2.5">
                            <UserAvatar firstName={user.first_name} lastName={user.last_name} email={user.email} />
                            <div className="flex-1 min-w-0">
                              {displayName && (
                                <p className="text-sm font-medium leading-tight">{displayName}</p>
                              )}
                              <p className={cn('text-xs text-muted-foreground', !displayName && 'text-sm font-medium text-foreground')}>
                                {user.email}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1 justify-end">
                              {groups.map(({ group, colorClass }) => (
                                <span
                                  key={group.id}
                                  className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', colorClass)}
                                >
                                  {group.name}
                                </span>
                              ))}
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
        </TabsContent>
      </Tabs>

      {/* ── Action Dialog ─────────────────────────────────────── */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAction ? 'Edit' : 'Add'}{' '}
              {actionForm.action_type === 'approval' ? 'Approval'
                : actionForm.action_type === 'login' ? 'Login Step'
                : actionForm.action_type === 'browser_script' ? 'Browser Script'
                : actionForm.action_type === 'sub_agent' ? 'Sub Agent'
                : 'Agent Step'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Action name" value={actionForm.name} onChange={(e) => setActionForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {actionForm.action_type === 'agent' && (
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
                <MultiSelectPicker
                  label="Connectors"
                  addLabel="Add Connector"
                  options={connectors.filter((c) => c.agent_enabled).map((c) => ({ id: c.id, label: (c as any).connector_name ?? c.id }))}
                  selectedIds={actionForm.connector_ids}
                  onAdd={(id) => setActionForm((f) => ({ ...f, connector_ids: [...f.connector_ids, id] }))}
                  onRemove={(id) => setActionForm((f) => ({ ...f, connector_ids: f.connector_ids.filter((x) => x !== id) }))}
                />
                <MultiSelectPicker
                  label="Skills"
                  description="Selected skills are combined and sent as the system prompt for this step."
                  addLabel="Add Skill"
                  options={skills.map((s) => ({ id: s.id, label: s.name, subLabel: s.description ?? undefined }))}
                  selectedIds={actionForm.skill_ids}
                  onAdd={(id) => setActionForm((f) => ({ ...f, skill_ids: [...f.skill_ids, id] }))}
                  onRemove={(id) => setActionForm((f) => ({ ...f, skill_ids: f.skill_ids.filter((x) => x !== id) }))}
                  pillClass="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800"
                />
              </>
            )}

            {actionForm.action_type === 'login' && (
              <>
                <div className="rounded-md bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 px-3 py-2 text-xs text-sky-700 dark:text-sky-400">
                  The agent will navigate to the URL and verify it can access the page. If login is required, it will pause and open the browser for you to log in manually.
                </div>
                <div className="space-y-1">
                  <Label>URL to verify <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="https://app.example.com/dashboard"
                    value={actionForm.loginUrl}
                    onChange={(e) => setActionForm(f => ({ ...f, loginUrl: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">The page the agent will navigate to in order to check login status.</p>
                </div>
                <div className="space-y-1">
                  <Label>How to confirm you're logged in <span className="text-destructive">*</span></Label>
                  <Textarea
                    placeholder="I can see the main dashboard with my name and a logout button"
                    value={actionForm.loginVerify}
                    onChange={(e) => setActionForm(f => ({ ...f, loginVerify: e.target.value }))}
                    rows={3}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Describe what you expect to see on screen when successfully logged in.</p>
                </div>
              </>
            )}

            {actionForm.action_type === 'approval' && (
              <div className="space-y-1">
                <Label>Instructions for Approver</Label>
                <Textarea placeholder="Describe what the approver needs to review and decide…" value={actionForm.approval_instructions} onChange={(e) => setActionForm(f => ({ ...f, approval_instructions: e.target.value }))} rows={4} className="text-sm" />
              </div>
            )}

            {actionForm.action_type === 'browser_script' && (
              <>
                <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-3 py-2 text-xs text-violet-700 dark:text-violet-400">
                  The agent will run this browser script in its existing browser session and feed extracted values into the next action.
                </div>
                <div className="space-y-1">
                  <Label>Script <span className="text-destructive">*</span></Label>
                  <Select value={actionForm.scriptId} onValueChange={(v) => {
                    const script = browserScripts.find((s) => s.id === v);
                    const params: Record<string, string> = {};
                    for (const p of (script?.parameters ?? [])) params[p] = '';
                    setActionForm(f => ({ ...f, scriptId: v, scriptParams: params }));
                  }}>
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
                {actionForm.scriptId && (() => {
                  const script = browserScripts.find((s) => s.id === actionForm.scriptId);
                  const params = script?.parameters ?? [];
                  if (params.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <Label>Parameter Mappings</Label>
                      <p className="text-xs text-muted-foreground">Map script parameters to values from the previous step output. Use <code className="bg-muted px-1 rounded">{'{{field_name}}'}</code> to reference extracted fields.</p>
                      {params.map((param) => (
                        <div key={param} className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-muted px-2 py-1 rounded w-32 shrink-0 truncate">{param}</span>
                          <Input
                            placeholder={`{{${param}}}`}
                            value={actionForm.scriptParams[param] ?? ''}
                            onChange={(e) => setActionForm(f => ({ ...f, scriptParams: { ...f.scriptParams, [param]: e.target.value } }))}
                            className="text-xs font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}

            {actionForm.action_type === 'sub_agent' && (
              <>
                <div className="rounded-md bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-400">
                  The previous step must output a JSON array. This action will run the selected agent once for each item in the array.
                </div>
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
                </div>
                <div className="space-y-1">
                  <Label>Input Field</Label>
                  <Input
                    placeholder="e.g. reservation_id, url (leave empty to pass entire item)"
                    value={actionForm.inputField}
                    onChange={(e) => setActionForm(f => ({ ...f, inputField: e.target.value }))}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    The JSON field from each array item to pass as the sub-agent's input. Leave empty to pass the entire item.
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
                    How many sub-agents to run in parallel. Higher values use more capacity — balance with other agents that may need browser slots.
                  </p>
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
                !actionForm.name.trim() ||
                (actionForm.action_type === 'agent' && !actionForm.prompt.trim()) ||
                (actionForm.action_type === 'login' && (!actionForm.loginUrl.trim() || !actionForm.loginVerify.trim())) ||
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
