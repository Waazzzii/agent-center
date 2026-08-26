'use client';

import { use, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  getAgent, updateAgent, deleteAgent, runAgent, setAgentClient,
  getActions, createAction, updateAction, deleteAction, reorderActions,
  createTrigger, deleteTrigger,
  generateWebhookKey, getWebhookKey,
  getValidSubAgents,
  type Agent, type AgentDetail, type AgentAction, type AgentTrigger, type AgentWebhookKey,
} from '@/lib/api/agents';
import { listClients, type Client } from '@/lib/api/clients';
import { getConnectors } from '@/lib/api/connectors';
import { getSkills, type Skill } from '@/lib/api/skills';
import { listScripts, type BrowserScript } from '@/lib/api/scripts';
import { listAiSteps, createAiStep, updateAiStep, type AiStep } from '@/lib/api/ai-steps';
import { listApprovalSteps, createApprovalStep, updateApprovalStep, type ApprovalStep } from '@/lib/api/approval-steps';
import { AiStepFormBody, type AiStepFormData } from '@/components/actions/AiStepFormBody';
import { LoginFormBody, type LoginFormData } from '@/components/actions/LoginFormBody';
import { LoginChip } from '@/components/actions/LoginChip';
import { listLogins, createLogin, updateLogin, type Login } from '@/lib/api/logins';
import { useTags } from '@/lib/hooks/use-tags';
import { TagPicker } from '@/components/tags/tag-picker';
import { EntityPreviewNotice } from '@/components/actions/EntityPreviewNotice';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BrowserScriptPreview } from '@/components/actions/BrowserScriptPreview';
import { SubAgentPreview } from '@/components/actions/SubAgentPreview';
import { ApprovalPreview } from '@/components/actions/ApprovalPreview';
import { InfoBlock } from '@/components/actions/InfoBlock';
import { ExecutionOptionsEditor, ExecutionOptionsSummary } from '@/components/actions/ExecutionOptionsEditor';
import { SlackChannelInput } from '@/components/notifications/SlackChannelInput';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Copy, RefreshCw, ArrowDown, GripVertical,
  Webhook, Clock, Play, History, CheckCircle2, PlayCircle, X, Monitor,
  LogIn, GitBranch, Settings, CircleDot, AlertTriangle, Globe, Users, Link as LinkIcon,
  Bot, Sparkles,
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
  const [clients, setClients] = useState<Client[]>([]);
  const [savingClient, setSavingClient] = useState(false);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [triggers, setTriggers] = useState<AgentTrigger[]>([]);
  const [connectors, setConnectors] = useState<OrganizationConnector[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [browserScripts, setBrowserScripts] = useState<BrowserScript[]>([]);
  const [webhookKey, setWebhookKey] = useState<AgentWebhookKey | null>(null);
  const [loading, setLoading] = useState(true);

  // Action dialog
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<AgentAction | null>(null);
  const [actionForm, setActionForm] = useState({
    // No display name in form state — derived from the linked
    // library entity at render time (server returns name via
    // COALESCE over the entity joins). See migration 209.
    action_type: 'agent' as 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent',
    aiStepId: '',
    loginId: '',
    scriptId: '',
    approvalStepId: '',
    targetAgentId: '',
    maxConcurrent: 3,
    batchSize: 1,
    maxRetries: 0,
    accessGroupIds: [] as string[],
    // Per-action cross-cutting options (migration 212). Null when nothing
    // is attached — the editor renders empty Apply buttons. When an
    // operator applies conditional_execution or continue_on_failure, the
    // ExecutionOptionsEditor updates this object and the form payload
    // sends it on save.
    executionOptions: null as import('@/lib/api/agents').ExecutionOptions | null,
  });
  const [aiSteps, setAiSteps] = useState<AiStep[]>([]);
  const [logins, setLogins] = useState<Login[]>([]);
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([]);
  const [validSubAgents, setValidSubAgents] = useState<Agent[]>([]);
  const [savingAction, setSavingAction] = useState(false);
  const [actionTypeModalOpen, setActionTypeModalOpen] = useState(false);

  // AI steps + approval steps are edited INLINE in the step panel (the same
  // form as the standalone editors), rather than only being pickable. `*Mode`
  // chooses create-a-new-one vs edit-the-existing-linked-one; the `new*Form`
  // draft is the working copy either way and is written on save (create or
  // update). Defaults to "new" so adding a step starts on a blank create form,
  // with a toggle to pick an existing one instead.
  const [aiStepMode, setAiStepMode] = useState<'new' | 'existing'>('new');
  const [newAiStepForm, setNewAiStepForm] = useState<AiStepFormData>({
    name: '', description: '', prompt: '', model: 'claude-sonnet-4-6',
    connector_ids: [], outputs: [], skill_ids: [],
  });

  const [approvalMode, setApprovalMode] = useState<'new' | 'existing'>('new');
  const [newApprovalStepForm, setNewApprovalStepForm] = useState({
    name: '',
    instructions: '',
    notificationSlackChannelId: '',
  });

  // Login profiles edit inline the same way (name / URL / verify script).
  const [loginMode, setLoginMode] = useState<'new' | 'existing'>('new');
  const [newLoginForm, setNewLoginForm] = useState<LoginFormData>({
    name: '', url: '', verify_script_id: null,
  });

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
  const [agentTagIds, setAgentTagIds] = useState<string[]>([]);
  const { tags: allTags, createTag } = useTags(selectedOrgId);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  // "Run now" button state — spinner while the trigger is in flight.
  // Mirrors the runningId pattern from the agent list page.
  const [runningAgent, setRunningAgent] = useState(false);
  // Settings modal replaces the old Settings tab so the agent editor
  // is one focused workflow view. Opened from the gear icon in the
  // header action cluster.
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      let [agentData, actionsData, connData, skillsData, allGroupsData, scriptsData, aiStepsData, loginsData, approvalStepsData] = await Promise.all([
        getAgent(selectedOrgId, agentId),
        getActions(selectedOrgId, agentId),
        getConnectors(selectedOrgId),
        getSkills(selectedOrgId),
        getAgentAccessGroups(selectedOrgId),
        // Deliberately UNFILTERED by kind. This list does double duty: it
        // populates the browser_script action picker AND resolves names for
        // actions that already exist. Filtering to 'regular' would be the
        // right end state, but any existing action pointing at a login
        // script would render with a blank label. Needs a label-fallback
        // pass before it can be narrowed.
        listScripts(selectedOrgId),
        listAiSteps(selectedOrgId).catch(() => [] as AiStep[]),
        listLogins(selectedOrgId).catch(() => [] as Login[]),
        listApprovalSteps(selectedOrgId).catch(() => [] as ApprovalStep[]),
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
      setAgentTagIds((agentData.tags ?? []).map((t) => t.id));
      setSettingsDirty(false);
      setActions((actionsData ?? []).sort((a, b) => a.order_index - b.order_index));
      // Clients for the assignment picker (non-blocking).
      void listClients(selectedOrgId).then(setClients).catch(() => {});
      const triggers = agentData.triggers ?? [];
      setTriggers(triggers);
      const webhookTrigger = triggers.find((t) => t.trigger_type === 'webhook');
      if (webhookTrigger) loadWebhookKey(webhookTrigger.id);
      setConnectors(connData.connectors);
      setSkills(skillsData.items ?? []);
      setBrowserScripts(scriptsData.scripts ?? []);
      setAiSteps(aiStepsData);
      setLogins(loginsData);
      setApprovalSteps(approvalStepsData);
      setAllGroups(allGroupsData);
    } catch (err: any) {
      toast.error('Failed to load agent');
      router.push('/agents');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, agentId, router]);

  // Lightweight in-place refresh after an edit — refetches ONLY the workflow
  // data and never toggles `loading`, so inline edits (steps, skills, login)
  // update the UI without a full-screen spinner.
  const refreshData = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      const [actionsData, scriptsData, aiStepsData, loginsData, approvalStepsData, skillsData] = await Promise.all([
        getActions(selectedOrgId, agentId),
        // Deliberately UNFILTERED by kind. This list does double duty: it
        // populates the browser_script action picker AND resolves names for
        // actions that already exist. Filtering to 'regular' would be the
        // right end state, but any existing action pointing at a login
        // script would render with a blank label. Needs a label-fallback
        // pass before it can be narrowed.
        listScripts(selectedOrgId),
        listAiSteps(selectedOrgId).catch(() => [] as AiStep[]),
        listLogins(selectedOrgId).catch(() => [] as Login[]),
        listApprovalSteps(selectedOrgId).catch(() => [] as ApprovalStep[]),
        getSkills(selectedOrgId),
      ]);
      setActions((actionsData ?? []).sort((a, b) => a.order_index - b.order_index));
      setBrowserScripts(scriptsData.scripts ?? []);
      setAiSteps(aiStepsData);
      setLogins(loginsData);
      setApprovalSteps(approvalStepsData);
      setSkills(skillsData.items ?? []);
    } catch {
      /* keep the current UI on a transient refresh failure */
    }
  }, [selectedOrgId, agentId]);

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

  // No realtime refresh on this page — it's purely an editor view.
  // The previous SSE → loadAll() loop fired on every execution event
  // org-wide, which caused the page to visibly redraw whenever any
  // agent ran (including the one you JUST clicked Run on). Anything
  // that actually changes during a run lives on the History page;
  // jump there if you want to watch it live.

  // ── Actions ──

  const openNewAction = (type: 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent') => {
    setEditingAction(null);
    setActionForm({
      action_type: type,
      aiStepId: '',
      loginId: '',
      scriptId: '',
      approvalStepId: '',
      targetAgentId: '',
      maxConcurrent: 3,
      batchSize: 1,
      maxRetries: 0,
      accessGroupIds: [],
      executionOptions: null,
    });
    // Inline editors start blank on "create new".
    setAiStepMode('new');
    setNewAiStepForm({ name: '', description: '', prompt: '', model: 'claude-sonnet-4-6', connector_ids: [], outputs: [], skill_ids: [] });
    setApprovalMode('new');
    setNewApprovalStepForm({ name: '', instructions: '', notificationSlackChannelId: '' });
    setLoginMode('new');
    setNewLoginForm({ name: '', url: '', verify_script_id: null });
    if (type === 'sub_agent' && selectedOrgId) {
      getValidSubAgents(selectedOrgId, agentId).then(setValidSubAgents).catch(() => {});
    }
    setActionDialogOpen(true);
  };

  const openEditAction = (action: AgentAction) => {
    setEditingAction(action);
    setActionForm({
      action_type: action.action_type,
      aiStepId: action.ai_step_id ?? '',
      loginId: action.login_id ?? '',
      scriptId: action.script_id ?? '',
      approvalStepId: action.approval_step_id ?? '',
      targetAgentId: action.target_agent_id ?? '',
      maxConcurrent: action.max_concurrent ?? 3,
      batchSize: action.batch_size ?? 1,
      maxRetries: action.max_retries ?? 0,
      accessGroupIds: [],
      executionOptions: action.execution_options ?? null,
    });
    // Seed the inline editors from the linked entity so editing a step edits
    // that entity in place (mode 'existing').
    if (action.action_type === 'agent') {
      setAiStepMode('existing');
      const s = aiSteps.find((x) => x.id === action.ai_step_id);
      setNewAiStepForm(s
        ? { name: s.name, description: s.description ?? '', prompt: s.prompt, model: s.model, connector_ids: s.connector_ids ?? [], outputs: s.outputs ?? [], skill_ids: s.skill_ids ?? [] }
        : { name: '', description: '', prompt: '', model: 'claude-sonnet-4-6', connector_ids: [], outputs: [], skill_ids: [] });
    }
    if (action.action_type === 'approval') {
      setApprovalMode('existing');
      const s = approvalSteps.find((x) => x.id === action.approval_step_id);
      setNewApprovalStepForm(s
        ? { name: s.name, instructions: s.instructions ?? '', notificationSlackChannelId: s.notification_slack_channel_id ?? '' }
        : { name: '', instructions: '', notificationSlackChannelId: '' });
    }
    if (action.action_type === 'login') {
      setLoginMode('existing');
      const l = logins.find((x) => x.id === action.login_id);
      setNewLoginForm(l
        ? { name: l.name, url: l.url, verify_script_id: l.verify_script_id ?? null }
        : { name: '', url: '', verify_script_id: null });
    }
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
    // AI step + approval step + login are edited inline: require the minimum fields.
    if (actionForm.action_type === 'agent' && (!newAiStepForm.name.trim() || !newAiStepForm.prompt.trim())) return;
    if (actionForm.action_type === 'approval' && !newApprovalStepForm.name.trim()) return;
    if (actionForm.action_type === 'login' && (!newLoginForm.name.trim() || !newLoginForm.url.trim() || !newLoginForm.verify_script_id)) return;
    try {
      setSavingAction(true);

      // Persist the inline-edited entity first (create a new one, or update the
      // existing linked one), then link its id onto the action payload below.
      let aiStepId = actionForm.aiStepId;
      if (actionForm.action_type === 'agent') {
        const aiInput = {
          name: newAiStepForm.name.trim(),
          description: newAiStepForm.description.trim() || null,
          prompt: newAiStepForm.prompt,
          model: newAiStepForm.model,
          connector_ids: newAiStepForm.connector_ids,
          outputs: newAiStepForm.outputs
            .filter((o) => o.key.trim())
            .map((o) => ({ key: o.key.trim(), description: o.description.trim(), required: o.required !== false })),
          skill_ids: newAiStepForm.skill_ids,
        };
        if (aiStepMode === 'existing' && aiStepId) {
          await updateAiStep(selectedOrgId, aiStepId, aiInput);
        } else {
          const created = await createAiStep(selectedOrgId, aiInput);
          aiStepId = created.id;
        }
      }

      let approvalStepId = actionForm.approvalStepId;
      if (actionForm.action_type === 'approval') {
        const apprInput = {
          name: newApprovalStepForm.name.trim(),
          instructions: newApprovalStepForm.instructions,
          notification_slack_channel_id: newApprovalStepForm.notificationSlackChannelId.trim() || null,
        };
        if (approvalMode === 'existing' && approvalStepId) {
          await updateApprovalStep(selectedOrgId, approvalStepId, apprInput);
        } else {
          const created = await createApprovalStep(selectedOrgId, apprInput);
          approvalStepId = created.id;
        }
      }

      let loginId = actionForm.loginId;
      if (actionForm.action_type === 'login') {
        const loginInput = {
          name: newLoginForm.name.trim(),
          url: newLoginForm.url.trim(),
          verify_script_id: newLoginForm.verify_script_id as string,
        };
        if (loginMode === 'existing' && loginId) {
          await updateLogin(selectedOrgId, loginId, loginInput);
        } else {
          const created = await createLogin(selectedOrgId, loginInput);
          loginId = created.id;
        }
      }

      // Display name is now derived server-side from the linked
      // library entity (migration 209 dropped agent_actions.name),
      // so the create/update payload no longer carries a `name`
      // field. Just the orchestration fields: action_type, the FK,
      // and per-workflow tuning.
      let payload: Record<string, unknown>;
      if (actionForm.action_type === 'agent') {
        payload = {
          action_type: 'agent',
          ai_step_id: aiStepId || null,
        };
      } else if (actionForm.action_type === 'login') {
        payload = {
          action_type: 'login',
          login_id: loginId || null,
        };
      } else if (actionForm.action_type === 'browser_script') {
        payload = {
          action_type: 'browser_script',
          script_id: actionForm.scriptId,
          // The identity this action runs as. Explicit null rather than omitted
          // so clearing it actually clears it on update.
          login_id: actionForm.loginId || null,
          max_retries: actionForm.maxRetries,
        };
      } else if (actionForm.action_type === 'sub_agent') {
        payload = {
          action_type: 'sub_agent',
          target_agent_id: actionForm.targetAgentId,
          max_concurrent: actionForm.maxConcurrent,
          batch_size: actionForm.batchSize,
        };
      } else {
        // Approval action — references a library row; instructions +
        // Slack channel live on agent_approval_steps.
        payload = {
          action_type: 'approval',
          approval_step_id: approvalStepId || null,
        };
      }
      // Per-action cross-cutting options (migration 212). Always sent as
      // an object so the server normalizer can confirm/clear cleanly —
      // null collapses to {} on the backend (= no options attached).
      payload.execution_options = actionForm.executionOptions ?? {};
      let savedActionId: string;
      if (editingAction) {
        await updateAction(selectedOrgId, agentId, editingAction.id, payload);
        savedActionId = editingAction.id;
        toast.success('Action updated');
      } else {
        // When adding a browser_script whose script has a linked login,
        // auto-create the paired login action immediately before it.
        // Skipped if the immediately-prior action is already a login
        // targeting the same login_id — operators who explicitly added
        // the login first don't get a duplicate.
        if (actionForm.action_type === 'browser_script' && actionForm.scriptId) {
          const selectedScript = browserScripts.find((s) => s.id === actionForm.scriptId);
          // The ACTION's login wins over the script default — on a shared script
          // the default is empty or belongs to another market, and pairing the
          // wrong login step is how an agent verifies one identity then scrapes
          // as another.
          const requiredLoginId = actionForm.loginId || selectedScript?.login_id || null;
          if (requiredLoginId) {
            const lastAction = actions[actions.length - 1];
            const alreadyHasMatchingLogin =
              lastAction?.action_type === 'login' && lastAction?.login_id === requiredLoginId;
            if (!alreadyHasMatchingLogin) {
              await createAction(selectedOrgId, agentId, {
                action_type: 'login',
                login_id: requiredLoginId,
              });
            }
          }
        }
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
      await refreshData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save action');
    } finally {
      setSavingAction(false);
    }
  };

  // ── Login ↔ Script pairing ─────────────────────────────────────
  // A login action is "paired" with the browser_script action right
  // after it when:
  //   • The script's row has a non-null login_id
  //   • That login_id matches the login action's login_id
  //
  // Paired actions get a chain-link visual treatment and are
  // deleted as a unit. The pairing is purely positional + matching FK
  // — moving the script away from its login (drag-reorder) silently
  // breaks the pair, which is the correct semantic.
  const actionPairs = useMemo(() => {
    const m = new Map<string, { partnerId: string; role: 'login' | 'script' }>();
    for (let i = 0; i < actions.length - 1; i++) {
      const cur = actions[i];
      const next = actions[i + 1];
      if (cur.action_type !== 'login' || next.action_type !== 'browser_script') continue;
      const nextScript = browserScripts.find((s) => s.id === next.script_id);
      if (!nextScript?.login_id) continue;
      if (cur.login_id !== nextScript.login_id) continue;
      m.set(cur.id,  { partnerId: next.id, role: 'login'  });
      m.set(next.id, { partnerId: cur.id,  role: 'script' });
    }
    return m;
  }, [actions, browserScripts]);

  // Sequential display numbers for VISIBLE steps only (paired logins render as a
  // chip on their script, not their own card, so they don't consume a number).
  const stepNumbers = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const a of actions) {
      if (a.action_type === 'login' && actionPairs.get(a.id)) continue;
      m.set(a.id, ++n);
    }
    return m;
  }, [actions, actionPairs]);

  const handleDeleteAction = async (actionId: string, name: string) => {
    if (!selectedOrgId) return;
    const pair = actionPairs.get(actionId);
    const description = pair
      ? `"${name}" is paired with its linked login step — both will be removed together.`
      : `Delete "${name}"?`;
    const confirmed = await confirm({
      title: 'Delete Action',
      description,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      // Paired delete: remove the partner first, then this action.
      // Order doesn't matter functionally (independent rows) but doing
      // partner-first avoids a brief inconsistent state where the
      // script is gone but its login lingers.
      if (pair) {
        await deleteAction(selectedOrgId, agentId, pair.partnerId);
      }
      await deleteAction(selectedOrgId, agentId, actionId);
      toast.success(pair ? 'Linked login + script deleted' : 'Action deleted');
      await refreshData();
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

  // Returns true on success so the settings modal can close itself
  // without waiting for a state re-render to observe settingsDirty.
  const handleSaveSettings = async (): Promise<boolean> => {
    if (!selectedOrgId) return false;
    try {
      setSavingSettings(true);
      const updated = await updateAgent(selectedOrgId, agentId, { name: agentName.trim(), description: agentDesc.trim() || undefined, is_active: agentActive, requires_browser: agentRequiresBrowser, tag_ids: agentTagIds });
      toast.success('Agent updated');
      setSettingsDirty(false);
      // Update the UI in place (no full-screen reload). The form already holds
      // the new values; merge the server's response so the header/badges refresh.
      setAgent((prev) => (prev ? { ...prev, ...updated } : prev));
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Failed to update agent');
      return false;
    } finally {
      setSavingSettings(false);
    }
  };

  // Assign / clear the owning client. Applies immediately (not part of the
  // dirty-save flow). A client-assigned agent receives the reserved client
  // inputs (_client_prompt / _client_media / _client_video) straight from the
  // kit chat — no pre-process step.
  const handleSetClient = async (clientId: string | null) => {
    if (!selectedOrgId || !agent) return;
    setSavingClient(true);
    try {
      const updated = await setAgentClient(selectedOrgId, agentId, clientId);
      toast.success(clientId ? 'Client assigned' : 'Client removed');
      setAgent((prev) => (prev ? { ...prev, ...updated } : prev));
      await refreshData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to update client');
    } finally {
      setSavingClient(false);
    }
  };

  // Manually trigger this agent (header Run button). Same code path
  // as the list page's per-row Run — fires a manual trigger via the
  // backend and toasts the outcome. No navigation — the SSE stream
  // already drives the page state so the new run shows up under
  // History without leaving the editor.
  const handleRunAgent = async () => {
    if (!selectedOrgId || !agent || runningAgent) return;
    try {
      setRunningAgent(true);
      await runAgent(selectedOrgId, agentId);
      toast.success(`"${agent.name}" triggered`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to run agent');
    } finally {
      setRunningAgent(false);
    }
  };

  // ── Computed ──

  const triggerIcon = { webhook: <Webhook className="h-4 w-4" />, cron: <Clock className="h-4 w-4" />, manual: <Play className="h-4 w-4" /> };
  const triggerLabel = { webhook: 'Webhook', cron: 'Cron Schedule', manual: 'Manual Only' };
  const trigger = triggers.find(t => t.trigger_type !== 'manual') ?? triggers.find(t => t.trigger_type === 'manual') ?? null;

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

  /**
   * Drag-and-drop reorder with pair awareness.
   *
   * A "drag block" is the slice of actions that moves together:
   *   • Unpaired card → block of 1
   *   • Either half of a login↔browser_script pair → block of 2
   *
   * Drop position is then snapped so we never split another pair —
   * if the operator drops onto the script-half of a target pair, we
   * land after that pair instead of between its login and script.
   *
   * This way the chain icon between paired cards is also a real
   * invariant, not just a render-time hint.
   */
  const handleDropAction = async (dropIdx: number) => {
    if (dragIndex === null || dragIndex === dropIdx) return;

    // 1. Figure out the drag block — pull the dragged card AND its
    //    pair partner (if any). Always ordered [login, script] so
    //    splice/insert math stays simple.
    const dragged = actions[dragIndex];
    if (!dragged) return;
    const dragPair = actionPairs.get(dragged.id);
    let blockStart: number;
    let blockLen: number;
    if (dragPair) {
      const partnerIdx = actions.findIndex((a) => a.id === dragPair.partnerId);
      if (partnerIdx === -1) {
        blockStart = dragIndex;
        blockLen = 1;
      } else {
        blockStart = Math.min(dragIndex, partnerIdx);
        blockLen = 2;
      }
    } else {
      blockStart = dragIndex;
      blockLen = 1;
    }

    // 2. Snap the drop target so we don't split another pair. If the
    //    target is the script-half of a pair, bump the drop index to
    //    point AFTER the pair so the inserted block lands cleanly
    //    below both halves.
    let targetIdx = dropIdx;
    const targetAction = actions[targetIdx];
    if (targetAction) {
      const targetPair = actionPairs.get(targetAction.id);
      if (targetPair && targetPair.role === 'script') {
        // Land after the script half → after the pair as a whole.
        targetIdx = targetIdx + 1;
      }
    }

    // 3. Splice the block out, adjusting the target index for any
    //    shift caused by the removal.
    const newActions = [...actions];
    const moved = newActions.splice(blockStart, blockLen);
    if (targetIdx > blockStart) targetIdx -= blockLen;
    newActions.splice(targetIdx, 0, ...moved);

    // 4. If neither end of the block moved, bail — no-op reorder.
    if (newActions.every((a, i) => a.id === actions[i]?.id)) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }

    setActions(newActions);
    setDragIndex(null);
    setDropIndex(null);
    try {
      await reorderActions(selectedOrgId!, agentId, newActions.map((a) => a.id));
    } catch {
      toast.error('Reorder failed');
      await refreshData();
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
      {/* Header — no Back button. The sidebar is always present and
          browser-back covers the "return to list" case. */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Bot className="h-5 w-5 text-brand" />
              {agent.name}
            </h1>
            <Badge variant={agent.is_active ? 'default' : 'secondary'}>{agent.is_active ? 'Active' : 'Inactive'}</Badge>
            {agent.requires_browser && (
              <Badge variant="outline" className="gap-1 border-info/40 text-info">
                <Monitor className="h-3 w-3" />Browser
              </Badge>
            )}
            {agent.client_id && (
              <Badge variant="outline" className="gap-1 border-brand/40 text-brand" title="This agent is assigned to a client and is client-gated">
                <Sparkles className="h-3 w-3" />
                {clients.find((c) => c.id === agent.client_id)?.name ?? 'Client'}
              </Badge>
            )}
          </div>
          {agent.description && <p className="text-sm text-muted-foreground mt-0.5">{agent.description}</p>}

          {/* Routine bindings — surfaces every centers.ssc_routines row this
              agent is currently assigned to. Verified state shown inline so
              admins know whether the SSC runtime gate is open. */}
          {agent.routine_bindings && agent.routine_bindings.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Bound to:</span>
              {agent.routine_bindings.map((b) => (
                <Badge
                  key={b.id}
                  variant="outline"
                  className={
                    b.agent_verified_at
                      ? 'gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                  }
                  title={
                    b.agent_verified_at
                      ? `Verified ${new Date(b.agent_verified_at).toLocaleDateString()} — domain: ${b.domain_type}`
                      : `Not yet verified — Submissions Center won't fire this routine`
                  }
                >
                  {b.name}
                  <span className="opacity-60">· {b.domain_type}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Action cluster — three icon buttons with hover-title
            tooltips: Run · History · Settings. All same shape (icon-only
            ghost buttons in a bordered group) so they read as a
            coherent toolbar rather than competing primary actions.
            Run is highlighted with the success-green icon to give it a
            slight visual lead — it's the most common reason an
            operator opens this page beyond initial setup. */}
        <div className="flex items-center rounded-md border shrink-0 divide-x">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-none rounded-l-md disabled:opacity-50"
            onClick={handleRunAgent}
            disabled={runningAgent || !agent.is_active}
            title={
              !agent.is_active
                ? 'Agent is inactive — activate it in Settings before running'
                : runningAgent
                  ? 'Triggering…'
                  : 'Run agent now'
            }
          >
            {runningAgent
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <Play className={cn('h-4 w-4', agent.is_active && 'text-success')} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-none"
            onClick={() => router.push(`/agent-history?agent_id=${agentId}`)}
            title="View execution history"
          >
            <History className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-none rounded-r-md"
            onClick={() => setSettingsOpen(true)}
            title="Agent settings"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* ── Workflow (no longer behind a tab — settings moved to a
          modal triggered by the gear icon in the header cluster). */}
      <div className="mt-2">
          <div className="space-y-0">

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
                        {trigger.trigger_type === 'webhook' && (() => {
                          // Agent webhook now lives on agent-backend (not wazzi-backend),
                          // and the host varies per environment (dev/staging/prod tunnels).
                          // NEXT_PUBLIC_AGENT_API_URL is the same env var the rest of the
                          // agent-center frontend uses to talk to agent-backend, so this
                          // stays correct without a separate config.
                          const agentApiBase = (process.env.NEXT_PUBLIC_AGENT_API_URL ?? '').replace(/\/+$/, '');
                          const webhookUrl = `${agentApiBase}/webhooks/agents/${trigger.id}`;
                          return (
                          <div className="mt-2 space-y-3">
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-background border px-2 py-1 rounded flex-1 truncate font-mono">
                                {webhookUrl}
                              </code>
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('URL copied'); }}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="rounded-md bg-muted/60 border px-3 py-2 space-y-1.5">
                              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">How to trigger</p>
                              <pre className="text-xs text-foreground whitespace-pre-wrap break-all leading-relaxed">{`POST ${webhookUrl}\nX-Wazzi-Key: <your-api-key>`}</pre>
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
                          );
                        })()}
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
                {actions.map((action, idx) => {
                  // Paired login + browser_script render as one visual
                  // unit. Both cards adopt the browser_script (violet)
                  // color treatment, sit flush together with no gap,
                  // and share a chain-icon overlay positioned over the
                  // seam between them. The login keeps its own LogIn
                  // glyph + label so the operator still understands
                  // what each step actually does inside the pair.
                  const pair = actionPairs.get(action.id);
                  const isPaired = !!pair;
                  // Paired logins are no longer their own card — they render as a
                  // chip on the browser-script step (see attachment slot below).
                  // The login action still exists + runs; this is purely visual.
                  if (action.action_type === 'login' && isPaired) return null;

                  // Drag: both halves of a login+script pair light up together.
                  const draggedAction = dragIndex !== null ? actions[dragIndex] : null;
                  const draggedPartnerId = draggedAction
                    ? actionPairs.get(draggedAction.id)?.partnerId
                    : undefined;
                  const isBeingDragged = dragIndex === idx
                    || (draggedPartnerId !== undefined && draggedPartnerId === action.id);

                  // Amber left-border flags steps carrying execution_options.
                  const hasExecutionOptions =
                    !!action.execution_options?.conditional_execution ||
                    action.execution_options?.continue_on_failure === true;

                  const stepNum = stepNumbers.get(action.id) ?? idx + 1;
                  const displayName =
                    action.action_type === 'login'          ? action.login_name :
                    action.action_type === 'agent'          ? action.ai_step_name :
                    action.action_type === 'browser_script' ? action.script_name :
                    action.action_type === 'sub_agent'      ? action.target_agent_name :
                    action.action_type === 'approval'       ? action.approval_step_name :
                    null;
                  const placeholder =
                    action.action_type === 'login'          ? '(no login selected)' :
                    action.action_type === 'agent'          ? '(no AI step selected)' :
                    action.action_type === 'browser_script' ? '(no script selected)' :
                    action.action_type === 'sub_agent'      ? '(no target agent)' :
                    action.action_type === 'approval'       ? '(no approval step selected)' :
                    '—';
                  const meta = ({
                    agent:          { label: 'AI Step',        icon: <Bot className="h-3 w-3" />,          solid: 'bg-blue-600',   soft: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
                    approval:       { label: 'Human Review',   icon: <CheckCircle2 className="h-3 w-3" />, solid: 'bg-orange-500', soft: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
                    login:          { label: 'Browser Login',  icon: <LogIn className="h-3 w-3" />,        solid: 'bg-sky-500',    soft: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
                    browser_script: { label: 'Browser Script', icon: <CircleDot className="h-3 w-3" />,    solid: 'bg-violet-500', soft: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
                    sub_agent:      { label: 'Run Agent',      icon: <GitBranch className="h-3 w-3" />,    solid: 'bg-amber-500',  soft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
                  } as const)[action.action_type];

                  return (
                  <div key={action.id}>
                    <div className="flex items-stretch gap-2">
                      <Card
                        className={cn(
                          'group relative flex-1 min-w-0 py-0 transition-all duration-150 cursor-pointer',
                          isBeingDragged && 'opacity-40 scale-[0.98]',
                          dropIndex === idx && !isBeingDragged && 'ring-2 ring-primary ring-offset-1',
                          hasExecutionOptions && 'border-l-4 border-l-amber-400 dark:border-l-amber-500',
                        )}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => { e.preventDefault(); setDropIndex(idx); }}
                        onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                        onDrop={() => handleDropAction(idx)}
                        onClick={() => openEditAction(action)}
                      >
                        {/* Step number + type icon, hanging off the top-left corner. */}
                        <div className="absolute -top-2.5 -left-2.5 z-10 flex items-center gap-1">
                          <span className={cn('grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-background', meta.solid)}>
                            {stepNum}
                          </span>
                          <span className={cn('grid h-5 w-5 place-items-center rounded-md ring-2 ring-background', meta.soft)} title={meta.label}>
                            {meta.icon}
                          </span>
                        </div>
                        <CardContent className="py-3 pl-5 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div
                                className={cn('truncate text-sm font-medium', !displayName && 'text-muted-foreground italic')}
                                title={displayName ?? undefined}
                              >
                                {displayName ?? placeholder}
                              </div>
                              {(() => {
                                const bits: string[] = [];
                                if (action.action_type === 'browser_script' && (action.max_retries ?? 0) > 0) {
                                  bits.push(`${action.max_retries} ${action.max_retries === 1 ? 'retry' : 'retries'}`);
                                }
                                return bits.length ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{bits.join(' · ')}</p> : null;
                              })()}
                              <ExecutionOptionsSummary options={action.execution_options} />
                            </div>
                            <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => { e.stopPropagation(); handleDeleteAction(action.id, displayName ?? 'this step'); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Right attachment (max ~1/3): the login for browser-script
                          steps, linked by a link icon. */}
                      {action.action_type === 'browser_script' && (() => {
                        // Read-only reflection of the login configured on the script
                        // itself (via the paired login step). It's added/removed by
                        // configuring the login on the browser script — not here — so
                        // there's no detach button; clicking it opens the login editor.
                        const loginActionId = actionPairs.get(action.id)?.partnerId;
                        const loginAction = loginActionId ? actions.find((a) => a.id === loginActionId) : null;
                        const login = loginAction?.login_id ? (logins.find((l) => l.id === loginAction.login_id) ?? null) : null;
                        if (!login) return null;
                        return (
                          <>
                            <LinkIcon className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground/60" />
                            <LoginChip
                              orgId={selectedOrgId}
                              login={login}
                              verifyScriptOptions={browserScripts.map((s) => ({ id: s.id, name: s.name }))}
                              onChanged={() => { if (selectedOrgId) void listLogins(selectedOrgId).then(setLogins).catch(() => {}); }}
                            />
                          </>
                        );
                      })()}
                    </div>

                    {/* Down-arrow connector showing the flow to the next step. */}
                    <div className="flex justify-center py-1">
                      <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  </div>
                  );
                })}

                {/* Add Step — compact, centered */}
                <button
                  type="button"
                  className="mx-auto block w-fit"
                  onClick={() => setActionTypeModalOpen(true)}
                >
                  <Card className="border-dashed border-2 py-0 hover:border-brand/50 hover:bg-muted/20 transition-colors cursor-pointer">
                    <CardContent className="py-1.5 px-4 flex items-center justify-center gap-1.5">
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">Add Step</span>
                    </CardContent>
                  </Card>
                </button>
              </div>
            </div>
          </div>
      </div>

      {/* ── Settings Modal ──────────────────────────────────────
          Replaces the old Settings tab. Same fields, same dirty
          tracking and Save semantics — just gated behind the gear
          icon in the header cluster so the page stays focused on
          the workflow editor by default. */}
      <Dialog
        open={settingsOpen}
        onOpenChange={(open) => {
          // Block close while a save is in flight (avoids dropping
          // an in-progress request and re-opening with stale state).
          if (!open && savingSettings) return;
          setSettingsOpen(open);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agent Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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

            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagPicker
                tags={allTags}
                selected={agentTagIds}
                onChange={(ids) => { setAgentTagIds(ids); setSettingsDirty(true); }}
                onCreate={(name) => createTag({ name })}
              />
            </div>

            {/* Client assignment — owns the agent for a kit client; the reserved
                client inputs flow straight to the agent's own steps. */}
            <div className="rounded-md border px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-brand" />Client
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {agent?.client_id
                      ? 'Assigned to a client — runnable from its agent kit, which passes _client_prompt / _client_media / _client_video to this agent.'
                      : 'Assign a client to make this agent runnable from that client’s agent kit.'}
                  </p>
                </div>
                <select
                  value={agent?.client_id ?? ''}
                  disabled={savingClient}
                  onChange={(e) => handleSetClient(e.target.value || null)}
                  className="h-9 max-w-[45%] rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                >
                  <option value="">None</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)} disabled={savingSettings}>
              Close
            </Button>
            <Button
              onClick={async () => {
                const ok = await handleSaveSettings();
                // Close on success; on failure the modal stays open
                // with the dirty form so the operator can retry.
                if (ok) setSettingsOpen(false);
              }}
              disabled={!settingsDirty || !agentName.trim() || savingSettings}
            >
              {savingSettings ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Action Dialog ─────────────────────────────────────── */}
      <Sheet open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
          <SheetHeader className="border-b px-4 py-4 sm:px-6">
            <SheetTitle>
              {editingAction ? 'Edit' : 'Add'}{' '}
              {actionForm.action_type === 'approval' ? 'Human Review'
                : actionForm.action_type === 'login' ? 'Browser Login'
                : actionForm.action_type === 'browser_script' ? 'Browser Script'
                : actionForm.action_type === 'sub_agent' ? 'Run Agent'
                : 'AI Step'}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
            {actionForm.action_type === 'agent' && (
              <>
                {/* Create a brand-new AI step (default) or edit an existing one
                    in place — the same editor as the standalone AI Step page. */}
                <div className="flex w-fit items-center gap-1 rounded-md bg-muted p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      // Keep aiStepId so switching back to "Use existing" restores
                      // the previously-selected step; just blank the draft form.
                      setAiStepMode('new');
                      setNewAiStepForm({ name: '', description: '', prompt: '', model: 'claude-sonnet-4-6', connector_ids: [], outputs: [], skill_ids: [] });
                    }}
                    className={cn('rounded px-3 py-1', aiStepMode === 'new' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}
                  >
                    New AI step
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAiStepMode('existing');
                      // Default to the step already linked to this action (or the
                      // last selected one) rather than a blank selection.
                      const targetId = actionForm.aiStepId || editingAction?.ai_step_id || '';
                      if (targetId) {
                        const s = aiSteps.find((x) => x.id === targetId);
                        setActionForm(f => ({ ...f, aiStepId: targetId }));
                        if (s) setNewAiStepForm({ name: s.name, description: s.description ?? '', prompt: s.prompt, model: s.model, connector_ids: s.connector_ids ?? [], outputs: s.outputs ?? [], skill_ids: s.skill_ids ?? [] });
                      }
                    }}
                    className={cn('rounded px-3 py-1', aiStepMode === 'existing' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}
                  >
                    Use existing
                  </button>
                </div>

                {aiStepMode === 'existing' && (
                  <div className="space-y-1">
                    <Label>AI Step</Label>
                    <SearchableSelect
                      value={actionForm.aiStepId}
                      options={aiSteps.map((s) => ({ value: s.id, label: s.name, hint: s.description ?? undefined }))}
                      placeholder="Select an AI skill to edit…"
                      emptyLabel="No AI skills yet"
                      searchPlaceholder="Search AI skills by name or description…"
                      onChange={(v) => {
                        const s = aiSteps.find((x) => x.id === v);
                        setActionForm(f => ({ ...f, aiStepId: v }));
                        if (s) setNewAiStepForm({ name: s.name, description: s.description ?? '', prompt: s.prompt, model: s.model, connector_ids: s.connector_ids ?? [], outputs: s.outputs ?? [], skill_ids: s.skill_ids ?? [] });
                      }}
                    />
                    <EntityPreviewNotice
                      entityLabel="AI step"
                      editHref={actionForm.aiStepId ? `/actions/ai-steps/${actionForm.aiStepId}` : '/actions/ai-steps'}
                      editLabel="AI Skills"
                    />
                  </div>
                )}

                {(aiStepMode === 'new' || actionForm.aiStepId) ? (
                  <AiStepFormBody
                    form={newAiStepForm}
                    setForm={setNewAiStepForm}
                    connectors={connectors
                      .filter((c) => (c as unknown as { agent_enabled?: boolean }).agent_enabled)
                      .map((c) => ({ id: c.id, label: (c as unknown as { connector_name?: string }).connector_name ?? c.id }))}
                    skills={skills}
                    availableVars={availableVars}
                    orgId={selectedOrgId}
                    onSkillsChanged={() => { if (selectedOrgId) getSkills(selectedOrgId).then((r) => setSkills(r.items ?? [])).catch(() => {}); }}
                    // Skills are not selectable from a routine — not here and not on
                    // the step card. Existing skill_ids on an AI step are left alone;
                    // they are managed where skills themselves live.
                    showSkills={false}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Pick an AI step above to edit it here.</p>
                )}
              </>
            )}

            {actionForm.action_type === 'login' && (
              <>
                <div className="flex w-fit items-center gap-1 rounded-md bg-muted p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode('new');
                      setNewLoginForm({ name: '', url: '', verify_script_id: null });
                    }}
                    className={cn('rounded px-3 py-1', loginMode === 'new' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}
                  >
                    New login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode('existing');
                      const targetId = actionForm.loginId || editingAction?.login_id || '';
                      if (targetId) {
                        const l = logins.find((x) => x.id === targetId);
                        setActionForm(f => ({ ...f, loginId: targetId }));
                        if (l) setNewLoginForm({ name: l.name, url: l.url, verify_script_id: l.verify_script_id ?? null });
                      }
                    }}
                    className={cn('rounded px-3 py-1', loginMode === 'existing' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}
                  >
                    Use existing
                  </button>
                </div>

                {loginMode === 'existing' && (
                  <div className="space-y-1">
                    <Label>Login Profile</Label>
                    <SearchableSelect
                      value={actionForm.loginId}
                      onChange={(v) => {
                        const l = logins.find((x) => x.id === v);
                        setActionForm(f => ({ ...f, loginId: v }));
                        if (l) setNewLoginForm({ name: l.name, url: l.url, verify_script_id: l.verify_script_id ?? null });
                      }}
                      options={logins.map((l) => ({ value: l.id, label: l.name, hint: l.url ?? undefined }))}
                      placeholder="Select a login profile to edit…"
                      emptyLabel="No logins yet"
                      searchPlaceholder="Search logins by name or URL…"
                    />
                    <EntityPreviewNotice
                      entityLabel="login profile"
                      editHref={actionForm.loginId ? `/actions/logins/${actionForm.loginId}` : '/actions/logins'}
                      editLabel="Logins"
                    />
                  </div>
                )}

                {(loginMode === 'new' || actionForm.loginId) ? (
                  <LoginFormBody
                    form={newLoginForm}
                    setForm={setNewLoginForm}
                    verifyScriptOptions={browserScripts.map((s) => ({ id: s.id, name: s.name }))}
                    availableVars={availableVars}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Pick a login profile above to edit it here.</p>
                )}

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
                <div className="flex w-fit items-center gap-1 rounded-md bg-muted p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setApprovalMode('new');
                      setNewApprovalStepForm({ name: '', instructions: '', notificationSlackChannelId: '' });
                    }}
                    className={cn('rounded px-3 py-1', approvalMode === 'new' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}
                  >
                    New review
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setApprovalMode('existing');
                      const targetId = actionForm.approvalStepId || editingAction?.approval_step_id || '';
                      if (targetId) {
                        const s = approvalSteps.find((x) => x.id === targetId);
                        setActionForm(f => ({ ...f, approvalStepId: targetId }));
                        if (s) setNewApprovalStepForm({ name: s.name, instructions: s.instructions ?? '', notificationSlackChannelId: s.notification_slack_channel_id ?? '' });
                      }
                    }}
                    className={cn('rounded px-3 py-1', approvalMode === 'existing' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}
                  >
                    Use existing
                  </button>
                </div>

                {approvalMode === 'existing' && (
                  <div className="space-y-1">
                    <Label>Approval Step</Label>
                    <Select
                      value={actionForm.approvalStepId}
                      onValueChange={(v) => {
                        const s = approvalSteps.find((x) => x.id === v);
                        setActionForm(f => ({ ...f, approvalStepId: v }));
                        if (s) setNewApprovalStepForm({ name: s.name, instructions: s.instructions ?? '', notificationSlackChannelId: s.notification_slack_channel_id ?? '' });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select an approval step to edit…" /></SelectTrigger>
                      <SelectContent>
                        {approvalSteps.length === 0 ? (
                          <SelectItem value="_none" disabled>No approval steps yet</SelectItem>
                        ) : (
                          approvalSteps.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
                        )}
                      </SelectContent>
                    </Select>
                    <EntityPreviewNotice
                      entityLabel="approval step"
                      editHref={actionForm.approvalStepId ? `/actions/approvals/${actionForm.approvalStepId}` : '/actions/approvals'}
                      editLabel="Approval Steps"
                    />
                  </div>
                )}

                {(approvalMode === 'new' || actionForm.approvalStepId) ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label>Name <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="e.g. Confirm contract submission"
                        value={newApprovalStepForm.name}
                        onChange={(e) => setNewApprovalStepForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Instructions for Approver</Label>
                      <Textarea
                        placeholder="Describe what the approver needs to review and decide. Supports {{variable}} templates."
                        value={newApprovalStepForm.instructions}
                        onChange={(e) => setNewApprovalStepForm(f => ({ ...f, instructions: e.target.value }))}
                        rows={5}
                        className="text-sm"
                      />
                    </div>
                    <SlackChannelInput
                      scope="approval"
                      value={newApprovalStepForm.notificationSlackChannelId}
                      onChange={(v) => setNewApprovalStepForm(f => ({ ...f, notificationSlackChannelId: v }))}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Pick an approval step above to edit it here.</p>
                )}
                {/* Access groups — who can approve. Per-action because
                    different agents using the same approval step may
                    want different reviewer audiences. */}
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
                  editLabel="Browser Skills"
                />
                <div className="space-y-1">
                  <Label>Script <span className="text-destructive">*</span></Label>
                  {/* Only real browser skills belong in a routine step. Login and
                      login-check scripts are run BY the login machinery, not
                      scheduled as steps. The full list is still loaded (it resolves
                      display names for existing actions), so an action already
                      pointing at a login script keeps its entry — otherwise it
                      would render blank and look deleted. */}
                  <SearchableSelect
                    value={actionForm.scriptId}
                    onChange={(v) => setActionForm(f => ({ ...f, scriptId: v }))}
                    options={browserScripts
                      .filter((s) => s.kind === 'regular' || s.id === actionForm.scriptId)
                      .map((s) => ({
                        value: s.id,
                        label: s.name,
                        hint: s.description ?? undefined,
                      }))}
                    placeholder="Select a browser skill…"
                    emptyLabel="No browser skills available"
                    searchPlaceholder="Search browser skills by name or description…"
                  />
                  {/* Browser scripts are recorded/edited in their own full-screen
                      recorder, so link across to Browser Scripts rather than
                      editing inline here. */}
                  <div className="flex items-center gap-3 pt-1">
                    <Link href="/actions/browser-scripts" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
                      <Plus className="h-3 w-3" /> Record a new script
                    </Link>
                    {actionForm.scriptId && (
                      <Link href="/actions/browser-scripts" className="text-xs text-muted-foreground hover:underline">
                        Edit in Browser Skills →
                      </Link>
                    )}
                  </div>
                </div>
                {(() => {
                  const selected = browserScripts.find((s) => s.id === actionForm.scriptId);
                  return selected ? (
                    <BrowserScriptPreview script={selected} availableVars={availableVars} />
                  ) : null;
                })()}

                {/* Which identity this action runs as.

                    Shown per ACTION, not per script, because that is what lets one
                    script serve many logins: eight markets on one AirBnB scrape are
                    eight actions pointing at the same script with eight different
                    logins. Cloning the script per credential set is the thing this
                    exists to avoid.

                    The script's own login_id is only the editor default and is
                    offered as a pre-fill, never silently used: on a shared script it
                    is empty or arbitrary. */}
                {(() => {
                  const selected = browserScripts.find((s) => s.id === actionForm.scriptId);
                  if (!selected) return null;
                  const required = selected.requires_login;
                  const usableLogins = logins.filter((l) => l.id === actionForm.loginId || true);
                  return (
                    <div className="space-y-1">
                      <Label>
                        Run as login{required && <span className="text-destructive"> *</span>}
                      </Label>
                      <SearchableSelect
                        value={actionForm.loginId}
                        onChange={(v) => setActionForm(f => ({ ...f, loginId: v }))}
                        options={logins.map((l) => ({
                          value: l.id,
                          label: l.name,
                          hint: l.url ?? undefined,
                        }))}
                        placeholder={required ? 'Select the login this action runs as…' : 'No login (unauthenticated)'}
                        emptyLabel="No logins configured"
                        searchPlaceholder="Search logins by name or URL…"
                      />
                      {required ? (
                        <p className="text-xs text-muted-foreground">
                          This script requires a login. Each action picks its own, so the
                          same script can run as a different identity in every agent.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Optional. Set this when the script needs to be signed in.
                        </p>
                      )}
                      {required && !actionForm.loginId && selected.login_id && (
                        <button
                          type="button"
                          className="text-xs text-brand hover:underline"
                          onClick={() => setActionForm(f => ({ ...f, loginId: selected.login_id as string }))}
                        >
                          Use the script's default ({logins.find((l) => l.id === selected.login_id)?.name ?? 'linked login'})
                        </button>
                      )}
                      {required && !actionForm.loginId && (
                        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            Without a login this action would run in a blank browser —
                            it would not fail, it would return empty results and report
                            success.
                          </span>
                        </div>
                      )}
                    </div>
                  );
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
                  <a
                    href="/agents/create"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Create a new agent
                  </a>
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

            {/* Per-action cross-cutting options (migration 212).
                Conditional Execution = predicate that gates this step
                per-item; non-matching items passthrough to the next step.
                Allow Failure = step failure becomes a tolerated warning
                and items passthrough instead of aborting the agent run.
                Available on every action_type (approval / login / AI step /
                browser_script / sub_agent) — approval and login rarely
                use them but the storage shape is uniform. */}
            <div className="mt-4 pt-4 border-t border-dashed border-muted-foreground/20">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Execution options
              </p>
              <ExecutionOptionsEditor
                value={actionForm.executionOptions}
                onChange={(opts) => setActionForm((f) => ({ ...f, executionOptions: opts }))}
              />
            </div>
          </div>
          <SheetFooter className="border-t px-4 py-4 sm:px-6">
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveAction}
              disabled={
                savingAction ||
                (actionForm.action_type === 'agent' && (!newAiStepForm.name.trim() || !newAiStepForm.prompt.trim())) ||
                (actionForm.action_type === 'approval' && !newApprovalStepForm.name.trim()) ||
                (actionForm.action_type === 'login' && (!newLoginForm.name.trim() || !newLoginForm.url.trim() || !newLoginForm.verify_script_id)) ||
                (actionForm.action_type === 'browser_script' && !actionForm.scriptId) ||
                // A requires_login script with no login would be rejected by the
                // API anyway; refusing here means the operator sees why.
                (actionForm.action_type === 'browser_script' &&
                  !!browserScripts.find((s) => s.id === actionForm.scriptId)?.requires_login &&
                  !actionForm.loginId) ||
                (actionForm.action_type === 'sub_agent' && !actionForm.targetAgentId)
              }
            >
              {savingAction ? 'Saving…' : editingAction ? 'Update' : 'Add Action'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 shrink-0">
                <PlayCircle className="h-4 w-4 text-blue-700 dark:text-blue-400" />
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
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 shrink-0">
                    <GitBranch className="h-4 w-4 text-amber-700 dark:text-amber-400" />
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

            {/* Browser Script — gated on requires_browser.
                Standalone Browser Login is intentionally NOT an option:
                a login by itself does nothing. The login step gets
                auto-added when a browser_script that's linked to a
                login is added; remove the script and the paired login
                goes with it. */}
            {agentRequiresBrowser ? (
              <button
                type="button"
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                onClick={() => { setActionTypeModalOpen(false); openNewAction('browser_script'); }}
              >
                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
                  <CircleDot className="h-4 w-4 text-violet-700 dark:text-violet-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">Browser Script</p>
                  <p className="text-xs text-muted-foreground">Execute a recorded browser automation script (login step auto-added when linked)</p>
                </div>
              </button>
            ) : (
              /* Same card as the enabled state — icon, title, description —
                 just muted, with the unlock action inline on the right.
                 It used to render as a differently-shaped dashed panel with
                 its own heading and a chip preview, which made a temporarily
                 unavailable option look like a different kind of thing. */
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-muted/30">
                <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0 opacity-50">
                  <CircleDot className="h-4 w-4 text-violet-700 dark:text-violet-400" />
                </div>
                <div className="min-w-0 opacity-60">
                  <p className="font-medium text-sm">Browser Script</p>
                  <p className="text-xs text-muted-foreground">
                    Needs browser mode enabled for this agent
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto shrink-0 text-xs border-info/40 text-info hover:bg-info-soft hover:border-info/60"
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
                  <Monitor className="mr-1.5 h-3.5 w-3.5" />Enable
                </Button>
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
