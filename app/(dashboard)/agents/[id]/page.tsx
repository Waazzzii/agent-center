'use client';

import { use, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  getAgent, updateAgent, deleteAgent, runAgent, setAgentClient,
  getActions, createAction, updateAction, deleteAction, reorderActions,
  createTrigger, updateTrigger, deleteTrigger,
  generateWebhookKey, getWebhookKey,
  getValidSubAgents,
  type Agent, type AgentDetail, type AgentAction, type AgentTrigger, type AgentWebhookKey,
} from '@/lib/api/agents';
import { listClients, clientDisplayName, type Client } from '@/lib/api/clients';
import { getConnectors } from '@/lib/api/connectors';
import { getSkills, type Skill } from '@/lib/api/skills';
import { listScripts, type BrowserScript } from '@/lib/api/scripts';
import { listAiSteps, createAiStep, updateAiStep, type AiStep } from '@/lib/api/ai-steps';
import { useAiModels } from '@/lib/hooks/use-ai-models';
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
import { PanelTabs } from '@/components/agents/PanelTabs';
import { ApprovalPreview } from '@/components/actions/ApprovalPreview';
import { InfoBlock } from '@/components/actions/InfoBlock';
import { ExecutionOptionsEditor, ExecutionOptionsSummary } from '@/components/actions/ExecutionOptionsEditor';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  Plus, Pencil, Trash2, Copy, RefreshCw, ArrowDown, GripVertical,
  Webhook, Clock, Play, History, CheckCircle2, PlayCircle, X,
  LogIn, GitBranch, Settings, CircleDot, AlertTriangle, Globe, Users, Link as LinkIcon,
  Bot, ChevronRight, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutcomeCard } from '@/components/agents/OutcomeCard';
import { ConfigRow, ConfigSlideOut } from '@/components/agents/ConfigSlideOut';
import { AgentAccessGroups } from '@/components/agents/AgentAccessGroups';

// ─── Cron description helper ──────────────────────────────────

/**
 * The "no product" option's value.
 *
 * A sentinel rather than '', because Radix reserves the empty string for the
 * placeholder and throws if a SelectItem uses it. Mapped back to null on the
 * way out, so agents.client_id still stores NULL for unassigned.
 */
const NO_PRODUCT = '__none__';

/**
 * The link between two things in the flow.
 *
 * ONE COMPONENT, because there were three: the trigger joined the steps with a
 * line plus a 14px arrow, the steps joined each other with a bare 16px arrow at
 * half opacity, and the outcome got a third variant. Read top to bottom the
 * rail visibly changed weight twice on the way down, which made the flow look
 * like three stacked lists rather than one sequence.
 *
 * Just the chip. It was drawn on a hairline rail at first, but the line only
 * ever spanned the gap between two cards — it could not run behind them — so
 * what it actually produced was a stack of disconnected stubs that looked like
 * a rail failing to join up. The chip alone says "and then" without promising
 * a continuous track that the layout cannot draw.
 *
 * Fixed height, so every gap in the flow is identical.
 */
function FlowConnector() {
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        <ArrowDown className="h-3 w-3" />
      </div>
    </div>
  );
}

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
  /**
   * What the Product picker offers.
   *
   * Only ACTIVE clients: a product that has been turned off leaves its client
   * deactivated so the assignment survives a re-enable, but offering it as a
   * fresh choice would let someone assign an agent to a product the org does
   * not have. The currently-assigned one is always kept, so a disabled
   * product still shows what it is rather than silently reading "None".
   */
  /**
   * The agents that run this one as a sub-agent step.
   *
   * Belongs with the TRIGGER, because that is what it is: another way this
   * agent starts. The Trigger bar said "Runs only when someone starts it" on
   * agents that three other agents call on a schedule — placement here is a
   * correctness fix, not decoration.
   *
   * Read-only, and rendered as a separate line rather than as a trigger row:
   * the relationship is owned by the CALLING agent's step list, so there is
   * nothing to edit from this side. The links go there.
   */
  const calledBy = useMemo(
    // SORTED BY NAME. The backend returns these in whatever order the join
    // produced, which at ten callers reads as no order at all — you cannot
    // tell "not in the list" from "further down the list" while scanning it.
    // localeCompare so it matches how the agents table sorts.
    () => [...(agent?.used_as_sub_agent_by ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [agent?.used_as_sub_agent_by],
  );

  const products = useMemo(
    () => clients.filter((c) => c.is_active || c.id === agent?.client_id),
    [clients, agent?.client_id],
  );
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
    // operator applies a conditional_execution gate, the
    // ExecutionOptionsEditor updates this object and the form payload
    // sends it on save.
    executionOptions: null as import('@/lib/api/agents').ExecutionOptions | null,
  });
  const [aiSteps, setAiSteps] = useState<AiStep[]>([]);
  // For the model name on AI-step cards. The catalog carries a display label
  // ("Claude Sonnet 5") for what the row stores as an id ("claude-sonnet-5").
  const { models: aiModels } = useAiModels(selectedOrgId);
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
    name: '', description: '', prompt: '', model: '',
    connector_ids: [], outputs: [], skill_ids: [],
  });

  const [approvalMode, setApprovalMode] = useState<'new' | 'existing'>('new');
  const [newApprovalStepForm, setNewApprovalStepForm] = useState({
    name: '',
    instructions: '',
    notificationSlackChannelId: '',
  });

  // Login profiles edit inline the same way (name / URL).
  const [loginMode, setLoginMode] = useState<'new' | 'existing'>('new');
  const [newLoginForm, setNewLoginForm] = useState<LoginFormData>({
    name: '',
  });

  // Trigger dialog
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  /** The Trigger detail panel. The flow shows a summary row; this holds the rest. */
  const [triggerPanelOpen, setTriggerPanelOpen] = useState(false);
  const [triggerForm, setTriggerForm] = useState({ trigger_type: 'webhook' as string, cron_expr: '0 9 * * *', description: '' });
  /*
   * Set while EDITING an existing trigger; null while creating one.
   *
   * Only cron triggers are editable. A webhook's URL and API key are derived
   * from its id, so changing one in place would leave every caller pointing at a
   * trigger whose behaviour had silently changed — recreating it forces the new
   * URL to be distributed, which is the honest outcome.
   */
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [savingTrigger, setSavingTrigger] = useState(false);

  // Generated webhook key reveal
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  /**
   * Drag-and-drop reorder state.
   *
   * The list reorders LIVE: as the pointer moves, the cards themselves shift
   * into the order they would land in, and releasing just keeps what is
   * already on screen. There is no indicator to interpret, which is what the
   * previous drop-line version kept getting wrong — a line drawn in a 2px gap
   * is an inference about where the card goes, and the answer to "does that
   * line mean above or below this card" was never reliably visible.
   *
   * `actions` is mutated during the drag for the preview. `dragOriginRef`
   * holds the order at drag start so a cancelled drag (Escape, or a release
   * outside the list) puts everything back.
   */
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOriginRef = useRef<AgentAction[] | null>(null);
  const droppedRef = useRef(false);

  // Settings (inline, replaces modal)
  const [agentName, setAgentName] = useState('');
  const [agentDesc, setAgentDesc] = useState('');
  const [agentActive, setAgentActive] = useState(true);
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
  /**
   * Workflow | Settings.
   *
   * Settings used to hide behind a gear in the header's icon cluster, beside
   * Run and History. Those two ACT on the agent; settings EDITS it, so it was
   * the odd one out in a toolbar — and a gear is the least specific icon in
   * the set, which made the most-configurable surface the hardest to find.
   * A named tab costs one row and says what it is.
   */
  const [activeTab, setActiveTab] = useState<'workflow' | 'settings'>('workflow');
  const [calledByOpen, setCalledByOpen] = useState(false);
  const [calledBySearch, setCalledBySearch] = useState('');

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
      setAgentTagIds((agentData.tags ?? []).map((t) => t.id));
      setSettingsDirty(false);
      setActions((actionsData ?? []).sort((a, b) => a.order_index - b.order_index));
      // Kit clients, which the picker presents as products (non-blocking).
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
    setNewAiStepForm({ name: '', description: '', prompt: '', model: '', connector_ids: [], outputs: [], skill_ids: [] });
    setApprovalMode('new');
    setNewApprovalStepForm({ name: '', instructions: '', notificationSlackChannelId: '' });
    setLoginMode('new');
    setNewLoginForm({ name: '' });
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
        : { name: '', description: '', prompt: '', model: '', connector_ids: [], outputs: [], skill_ids: [] });
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
      setNewLoginForm(l ? { name: l.name } : { name: '' });
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
    // Name only. The URL is no longer asked for here — it comes from the
    // login script's first navigate, and this inline editor has no script
    // picker, so gating on a field nobody can fill would make Save dead.
    if (actionForm.action_type === 'login' && !newLoginForm.name.trim()) return;
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
  //   • The script action carries a login_id
  //   • That login_id matches the login action's login_id
  //
  // Paired actions get a chain-link visual treatment and are
  // deleted as a unit. The pairing is purely positional + matching FK
  // — moving the script away from its login (drag-reorder) silently
  // breaks the pair, which is the correct semantic.
  //
  // This reads the ACTION's login_id, not the script row's. It used to
  // require a non-null agent_browser_scripts.login_id, which is the retired
  // script-level default — so whether two steps LOOKED linked depended on
  // when the script happened to be authored. Scripts predating the move to
  // per-action logins still carry the column and rendered as a linked pair;
  // anything authored after it does not, and rendered as two loose steps
  // despite being wired identically. Same agent shape, different picture.
  //
  // The action's login_id is the binding the runtime actually uses, so the
  // display now follows the same fact the executor does — and it keeps
  // working once the legacy column is cleared.
  // Only the AI-step form has modes (new vs existing), so only its header
  // carries a tab rail — every other action type opens straight onto fields.
  const isAiStepAction = actionForm.action_type === 'agent';

  const actionPairs = useMemo(() => {
    const m = new Map<string, { partnerId: string; role: 'login' | 'script' }>();
    for (let i = 0; i < actions.length - 1; i++) {
      const cur = actions[i];
      const next = actions[i + 1];
      if (cur.action_type !== 'login' || next.action_type !== 'browser_script') continue;
      if (!next.login_id) continue;
      if (cur.login_id !== next.login_id) continue;
      m.set(cur.id,  { partnerId: next.id, role: 'login'  });
      m.set(next.id, { partnerId: cur.id,  role: 'script' });
    }
    return m;
  }, [actions]);

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

  /** Open the trigger dialog pre-filled, to edit an existing cron schedule. */
  const handleEditTrigger = (trigger: AgentTrigger) => {
    setEditingTriggerId(trigger.id);
    setTriggerForm({
      trigger_type: trigger.trigger_type,
      cron_expr: String(trigger.trigger_config?.cron_expr ?? '0 9 * * *'),
      description: String(trigger.trigger_config?.description ?? ''),
    });
    setTriggerDialogOpen(true);
  };

  /** Reset to create-mode whenever the dialog closes, so the next open is clean. */
  const closeTriggerDialog = (open: boolean) => {
    setTriggerDialogOpen(open);
    if (!open) {
      setEditingTriggerId(null);
      setTriggerForm({ trigger_type: 'webhook', cron_expr: '0 9 * * *', description: '' });
    }
  };

  const handleSaveTrigger = async () => {
    if (!selectedOrgId) return;
    try {
      setSavingTrigger(true);
      const config: Record<string, unknown> = {};
      if (triggerForm.trigger_type === 'cron') config.cron_expr = triggerForm.cron_expr;
      if (triggerForm.description) config.description = triggerForm.description;

      if (editingTriggerId) {
        // Edit in place. The backend re-registers the schedule on the way
        // through, so the new expression takes effect without a restart.
        await updateTrigger(selectedOrgId, agentId, editingTriggerId, { trigger_config: config });
        toast.success('Schedule updated');
        closeTriggerDialog(false);
        await loadAll();
        return;
      }

      const trigger = await createTrigger(selectedOrgId, agentId, { trigger_type: triggerForm.trigger_type, trigger_config: config });
      toast.success('Trigger created');
      closeTriggerDialog(false);
      await loadAll();
      if (trigger.trigger_type === 'webhook') {
        const keyResult = await generateWebhookKey(selectedOrgId, agentId, trigger.id);
        setNewRawKey(keyResult.key);
        await loadWebhookKey(trigger.id);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || (editingTriggerId ? 'Failed to update trigger' : 'Failed to create trigger'));
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
      const updated = await updateAgent(selectedOrgId, agentId, { name: agentName.trim(), description: agentDesc.trim() || undefined, is_active: agentActive, tag_ids: agentTagIds });
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
   * Move the dragged step (and its pair partner) to a gap in the CURRENT
   * list, updating `actions` so the cards visibly shift.
   *
   * A "drag block" is the slice that moves together: an unpaired card is a
   * block of 1, either half of a login+browser_script pair is a block of 2.
   * The gap is snapped so the block never lands between another pair's two
   * halves — the chain between them is a real invariant, not a hint.
   *
   * @param gap 0 = before the first action, list.length = after the last.
   */
  const previewMoveTo = (gap: number) => {
    if (!dragId) return;
    const list = actions;
    const from = list.findIndex((a) => a.id === dragId);
    if (from === -1) return;

    const pair = actionPairs.get(dragId);
    let blockStart = from;
    let blockLen = 1;
    if (pair) {
      const partnerIdx = list.findIndex((a) => a.id === pair.partnerId);
      if (partnerIdx !== -1) {
        blockStart = Math.min(from, partnerIdx);
        blockLen = 2;
      }
    }

    let target = gap;
    const before = list[target - 1];
    const after  = list[target];
    if (before && after) {
      const bp = actionPairs.get(before.id);
      const ap = actionPairs.get(after.id);
      if (bp && ap && bp.partnerId === after.id && ap.partnerId === before.id) target += 1;
    }

    // Gap already adjacent to the block on either side — the move is a no-op,
    // and running it anyway would re-render on every pointer event.
    if (target >= blockStart && target <= blockStart + blockLen) return;

    const next = [...list];
    const moved = next.splice(blockStart, blockLen);
    if (target > blockStart) target -= blockLen;
    next.splice(target, 0, ...moved);
    if (next.every((a, i) => a.id === list[i].id)) return;
    setActions(next);
  };

  /** Persist whatever order is on screen. Called on release. */
  const commitDrag = async () => {
    droppedRef.current = true;
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    setDragId(null);
    if (!origin) return;
    // Nothing actually moved — skip the round trip.
    if (actions.every((a, i) => a.id === origin[i]?.id)) return;
    try {
      await reorderActions(selectedOrgId!, agentId, actions.map((a) => a.id));
    } catch {
      toast.error('Reorder failed');
      await refreshData();
    }
  };

  /**
   * Released outside the list, or cancelled with Escape. The browser fires
   * dragend for both, and it fires AFTER drop — so `droppedRef` is what
   * separates "landed somewhere" from "let go of it in the void", and the
   * preview is rolled back only in the second case.
   */
  const cancelDrag = () => {
    if (!droppedRef.current && dragOriginRef.current) setActions(dragOriginRef.current);
    dragOriginRef.current = null;
    droppedRef.current = false;
    setDragId(null);
  };

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    // delayDuration 300: step descriptions are something you point at to
    // check, not something that should fire while the pointer crosses the
    // flow on its way somewhere else.
    <TooltipProvider delayDuration={300}>
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
            {/* No product badge here. It is set in Settings and shown in the
                agents table; repeating it beside the name spent the most
                prominent spot on the page on something you change once and
                then never think about. */}
          </div>
          {agent.description && <p className="text-sm text-muted-foreground mt-0.5">{agent.description}</p>}

          {/* "Bound to" was here: the centers.ssc_routines rows this agent is
              assigned to. Removed — it is a Submissions Center concept, and
              the Agent Center is not where you reason about it. It also sat in
              the most prominent spot on the page for something most agents in
              most orgs will never have. The bindings and their verified state
              still live in Submissions Center, which owns them. */}
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
            className="h-9 w-9 rounded-none rounded-r-md"
            onClick={() => router.push(`/agent-history?agent_id=${agentId}`)}
            title="View execution history"
          >
            <History className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* ── Workflow | Settings ──────────────────────────────────────
          A segmented control in a panel header, not underlined tabs on the
          page background. Bare tabs left the content floating with nothing
          holding it: the flow is a centred 720px column inside a 1200px page,
          so without a frame it read as an island with a rule above it. The
          panel gives the column an edge to sit in, and putting the control in
          its header makes the relationship obvious — this switch changes what
          is in THIS box.

          Segmented rather than underlined because there are exactly two
          mutually exclusive views. An underline scales to six tabs; a pill
          pair says "one or the other" at a glance and takes less room. */}
      {/* A GRADIENT, NOT A CARD.
          The card version had a hard bottom edge that closed the flow off
          mid-page, and a Card is `flex flex-col gap-6` — overriding py-0
          without gap-0 left a 24px band between the header and the body
          showing bg-card through, which is the stray colour. Rather than
          patch the gap, the frame goes: a tint at the top that fades to
          nothing, so the panel has a clear beginning and simply dissolves
          into the page instead of drawing a box around a flow of unknown
          length. Tabs sit INSIDE the tint, where it is strongest, so they
          still read as attached to what they switch. */}
      <div className="mt-4 rounded-t-xl bg-gradient-to-b from-muted/60 via-muted/20 to-transparent">
        <div className="flex items-center gap-3 px-3 pb-3 pt-3">
          {/* Bordered track: on a tinted ground a bare bg-muted track would
              blend into the gradient behind it. */}
          <div className="inline-flex items-center gap-0.5 rounded-lg border bg-background/50 p-0.5">
            {([
              { key: 'workflow', label: 'Workflow' },
              { key: 'settings', label: 'Settings' },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                aria-pressed={activeTab === t.key}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  activeTab === t.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* A divider that fades out at both ends.
            The tabs do need separating from what they switch — without any
            line the control floated on the tint. But a full-width rule is how
            the card looked in the first place: it reads as the top edge of a
            box, and the whole point of the gradient is that there is no box.
            Fading it out at the margins divides the two without closing
            anything, and it matches the way the tint itself ends. */}
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Deep bottom padding so the gradient still has room to fade AFTER
            the last thing in the flow — without it the tint would be cut off
            by the content and read as an edge again. */}
        <div className="px-4 pb-16 pt-6 sm:px-6">

      {/* ── Workflow ─────────────────────────────────────────────────
          Constrained to a reading column rather than the page's full
          1200px. The steps carry one line of text each; stretched edge to
          edge they read as mostly empty space with a word floating on the
          left. Narrowing is also why left-to-right was the wrong fix — the
          flow was never too tall, it was too wide. */}
      {activeTab === 'workflow' && (
      <div className="mx-auto w-full max-w-[720px]">
          <div className="space-y-0">

            {/* Trigger — a bookend, not a step. The section name rides
                inside the bar (see ConfigRow's `section`), so the caption
                that used to float above it is gone. */}
            <div>
              {trigger ? (
                <>
                  {/* A summary in the flow, the detail in a panel. A webhook
                      trigger rendered its URL, a how-to block and an API key
                      inline — the card you edit least often was taller than
                      every step put together. */}
                  <ConfigRow
                    section="Trigger"
                    icon={Play}
                    label={triggerLabel[trigger.trigger_type as keyof typeof triggerLabel]}
                    configured
                    // "Runs ONLY when someone starts it" is false the moment
                    // another agent calls this one as a sub-agent — which the
                    // row below this one spells out. Drop the "only" rather
                    // than let the bar contradict the line under it.
                    summary={
                      trigger.trigger_type === 'cron'
                        ? describeCron(String(trigger.trigger_config.cron_expr ?? ''))
                        : trigger.trigger_type === 'webhook'
                          ? 'Runs when its webhook URL is called'
                          : calledBy.length > 0
                            ? 'Runs when someone starts it'
                            : 'Runs only when someone starts it'
                    }
                    onClick={() => setTriggerPanelOpen(true)}
                  />

                  {/* Sits under the Trigger bar, inside the same block, so it
                      reads as a footnote to "how this starts" rather than a
                      step of its own — no number, no card, no connector.

                      A COUNT, NOT A LIST. Names inline made the row's length a
                      function of the data: one caller was a footnote, six were
                      a paragraph sitting above the flow, and capping the list
                      only traded that for a truncation nobody could act on. A
                      count is fixed width whatever the number, and the dialog
                      behind it can afford to show every caller properly —
                      with search, which an inline list could never have. */}
                  {calledBy.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 pl-3 text-xs text-muted-foreground">
                      <GitBranch className="h-3 w-3 shrink-0 text-amber-500" />
                      {/* "Also run by X — it runs whenever they do" described a
                          side effect and left you to infer the mechanism. This
                          agent is a STEP inside those agents, which is the fact
                          that matters: it explains why it runs, why its inputs
                          come from somewhere else, and why editing it changes
                          their behaviour too. */}
                      <span>Called as a sub-agent by</span>
                      <button
                        type="button"
                        onClick={() => { setCalledBySearch(''); setCalledByOpen(true); }}
                        className="font-medium text-foreground underline decoration-dotted underline-offset-4 hover:text-brand"
                      >
                        {calledBy.length} other {calledBy.length === 1 ? 'agent' : 'agents'}
                      </button>
                    </div>
                  )}

                  <ConfigSlideOut
                    open={triggerPanelOpen}
                    onOpenChange={setTriggerPanelOpen}
                    title={triggerLabel[trigger.trigger_type as keyof typeof triggerLabel]}
                    description="How this agent gets started."
                  >
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
                      <div className="flex items-center gap-0.5 shrink-0">
                        {/* Cron only. A webhook's URL is derived from its id, so
                            editing one in place would change behaviour behind
                            every caller still using the old URL. */}
                        {trigger.trigger_type === 'cron' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Edit schedule"
                            aria-label="Edit schedule"
                            onClick={() => handleEditTrigger(trigger)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {trigger.trigger_type !== 'manual' && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Remove trigger" aria-label="Remove trigger" onClick={() => handleDeleteTrigger(trigger.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </ConfigSlideOut>
                </>
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

            <FlowConnector />

            {/* Steps — inset from the bookends on purpose. The bars above
                and below run the full width of the column; the steps sit
                inside them. That is the whole distinction, and it survives
                greyscale, which the old colour-only one did not. The "Steps"
                caption is gone with it: once the shape says which is which,
                the caption was labelling the obvious. */}
            <div>
              <div className="px-6">
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
                  const draggedPartnerId = dragId ? actionPairs.get(dragId)?.partnerId : undefined;
                  const isBeingDragged = dragId === action.id || draggedPartnerId === action.id;
                  // The gaps this card occupies. A script card swallows its
                  // paired login (rendered as a chip inside it), so its top
                  // edge is the LOGIN's gap — without this, aiming above such
                  // a card asked to land between the login and its script,
                  // which the pair snap then bounced to the far side.
                  const gapAbove = pair?.role === 'script' ? idx - 1 : idx;
                  const gapBelow = idx + 1;

                  // Amber left-border flags steps carrying execution_options.
                  const hasExecutionOptions = !!action.execution_options?.conditional_execution;

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
                  // `tint` is the type's colour as TEXT, for the label beside
                  // the icon. Without it the label was text-muted-foreground
                  // while the number badge was fully saturated, so a step row
                  // read as grey with a coloured dot on it — the type colour
                  // was carried by 16px of chip and nothing else. Colouring
                  // the words is what makes the type scannable down a flow,
                  // which is the only reason these colours exist.
                  const meta = ({
                    agent:          { label: 'AI Step',        icon: <Bot className="h-3 w-3" />,          solid: 'bg-blue-600',   soft: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',       tint: 'text-blue-700 dark:text-blue-400' },
                    approval:       { label: 'Human Review',   icon: <CheckCircle2 className="h-3 w-3" />, solid: 'bg-orange-500', soft: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', tint: 'text-orange-700 dark:text-orange-400' },
                    login:          { label: 'Browser Login',  icon: <LogIn className="h-3 w-3" />,        solid: 'bg-sky-500',    soft: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',          tint: 'text-sky-700 dark:text-sky-400' },
                    browser_script: { label: 'Browser Script', icon: <CircleDot className="h-3 w-3" />,    solid: 'bg-violet-500', soft: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', tint: 'text-violet-700 dark:text-violet-400' },
                    sub_agent:      { label: 'Run Agent',      icon: <GitBranch className="h-3 w-3" />,    solid: 'bg-amber-500',  soft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',    tint: 'text-amber-700 dark:text-amber-400' },
                  } as const)[action.action_type];

                  /**
                   * The short facts that ride on the header row, opposite the
                   * type label.
                   *
                   * A step card is as wide as the column and carried one line
                   * of text, so the whole right half was empty — you had to
                   * open a step to see which model it used or whether it had
                   * any tools. These are the questions people actually scan a
                   * routine for, so they belong on the card.
                   *
                   * CAPPED AT THREE, and only facts that are true of THIS step
                   * rather than defaults. A card listing "0 retries" and "no
                   * condition" on every row would fill the space without
                   * adding anything, and the eye stops reading a field that is
                   * usually the same.
                   */
                  /**
                   * What this step is FOR, in the author's own words.
                   *
                   * The name row was the emptiest part of the card — a short
                   * step name on the left and nothing else across the rest of
                   * a 600px row. Every reusable entity already carries a
                   * description that until now you could only read by opening
                   * it, which is the thing a flow overview exists to save you.
                   *
                   * On the SAME row as the name, not below it: the card is
                   * already the height people liked, and the space that needed
                   * using was horizontal.
                   */
                  let stepDescription: string | null = null;

                  const stepFacts: string[] = [];
                  if (action.action_type === 'agent') {
                    const step = aiSteps.find((s) => s.id === action.ai_step_id);
                    if (step) {
                      // Description only. The prompt is NOT used as a fallback:
                      // it is an instruction to a model, and a truncated system
                      // prompt shown where a summary belongs reads as a summary
                      // and misrepresents the step.
                      stepDescription = step.description ?? null;
                      const model = aiModels.find((m) => m.model_id === step.model);
                      // "Claude Sonnet 5" → "Sonnet 5": the vendor is the same
                      // for every row, so it is the part that carries no
                      // information here.
                      if (model) stepFacts.push(model.label.replace(/^Claude\s+/i, ''));
                      const tools = step.connector_ids?.length ?? 0;
                      if (tools > 0) stepFacts.push(`${tools} ${tools === 1 ? 'tool' : 'tools'}`);
                      const outs = step.outputs?.length ?? 0;
                      if (outs > 0) stepFacts.push(`${outs} ${outs === 1 ? 'output' : 'outputs'}`);
                    }
                  } else if (action.action_type === 'sub_agent') {
                    stepDescription = validSubAgents.find((a) => a.id === action.target_agent_id)?.description ?? null;
                    if (action.batch_size && action.batch_size > 1) stepFacts.push(`batches of ${action.batch_size}`);
                    if (action.max_concurrent && action.max_concurrent > 1) stepFacts.push(`${action.max_concurrent} at a time`);
                  } else if (action.action_type === 'browser_script') {
                    const script = browserScripts.find((s) => s.id === action.script_id);
                    // Falls back to the recorded length. Not as good as a
                    // sentence someone wrote, but it is real and it is the
                    // thing that tells a two-click script from a forty-step
                    // one at a glance.
                    stepDescription = script?.description
                      || (script?.steps?.length
                        ? `${script.steps.length} recorded ${script.steps.length === 1 ? 'step' : 'steps'}`
                        : null);
                    if ((action.max_retries ?? 0) > 0) {
                      stepFacts.push(`${action.max_retries} ${action.max_retries === 1 ? 'retry' : 'retries'}`);
                    }
                  } else if (action.action_type === 'login') {
                    // A login has no description; its URL is the useful fact —
                    // which site this signs into. Host only: the full URL is a
                    // sign-in path nobody reads.
                    const url = logins.find((l) => l.id === action.login_id)?.url;
                    if (url) { try { stepDescription = new URL(url).host; } catch { stepDescription = url; } }
                  } else if (action.action_type === 'approval') {
                    stepDescription = approvalSteps.find((a) => a.id === action.approval_step_id)?.instructions ?? null;
                  }

                  return (
                  <div
                    key={action.id}
                    // The row as a whole accepts the drop, not just the card.
                    // Between two cards sits a connector arrow with no handler
                    // of its own; releasing there used to hit nothing and the
                    // drag was dropped on the floor.
                    onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                    onDrop={(e) => { if (!dragId) return; e.preventDefault(); void commitDrag(); }}
                  >
                    <div className="flex items-stretch gap-2">
                      <Card
                        className={cn(
                          'group relative flex-1 min-w-0 py-0 transition-all duration-150 cursor-pointer',
                          isBeingDragged && 'opacity-40 scale-[0.98]',
                          hasExecutionOptions && 'border-l-4 border-l-amber-400 dark:border-l-amber-500',
                        )}
                        draggable
                        onDragStart={(e) => {
                          dragOriginRef.current = actions;
                          droppedRef.current = false;
                          setDragId(action.id);
                          // Firefox refuses to start a drag without payload,
                          // and without effectAllowed the cursor shows "no
                          // drop" over valid targets.
                          e.dataTransfer.effectAllowed = 'move';
                          try { e.dataTransfer.setData('text/plain', action.id); } catch { /* older browsers */ }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          // Which HALF of the card the pointer is over decides
                          // which side of it the step lands on. The list then
                          // reorders under the cursor, so what you see during
                          // the drag is the result.
                          const r = e.currentTarget.getBoundingClientRect();
                          previewMoveTo(e.clientY > r.top + r.height / 2 ? gapBelow : gapAbove);
                        }}
                        onDragEnd={cancelDrag}
                        onDrop={(e) => {
                          // preventDefault is REQUIRED for the drop to fire at
                          // all in Chrome — its absence is the other half of
                          // "only works sometimes".
                          e.preventDefault();
                          void commitDrag();
                        }}
                        onClick={() => openEditAction(action)}
                      >
                        {/* The step's position in the flow, hanging off the
                            corner. Only the number lives out here now — where
                            it sits IS what it means. The type moved inside,
                            below. */}
                        <div className="absolute -top-2.5 -left-2.5 z-10">
                          <span className={cn('grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-background', meta.solid)}>
                            {stepNum}
                          </span>
                        </div>
                        <CardContent className="py-2.5 pl-5 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              {/* What kind of step this is, spelled out. It
                                  used to be an icon with the name only in a
                                  title tooltip, which meant telling a Browser
                                  Script from a Run Agent took a hover per card.

                                  A HEADER ROW, not a left segment like the
                                  Trigger and On completion bars. Those two are
                                  defined by their left segment; giving steps
                                  one too would converge the shapes and undo the
                                  distinction. Labelling down the card instead
                                  of across it keeps steps and bookends telling
                                  apart at a glance. */}
                              {/* Row 1. flex-wrap so the facts drop under the
                                  type label on a phone rather than truncating
                                  to nothing — the two-line rule is a desktop
                                  rule, and stacking is the right answer when
                                  there is no width to share. */}
                              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded', meta.soft)}>
                                  {meta.icon}
                                </span>
                                <span className={cn('shrink-0 text-[10px] font-semibold uppercase tracking-wider', meta.tint)}>
                                  {meta.label}
                                </span>
                                {stepFacts.length > 0 && (
                                  <span className="ml-auto truncate text-[10px] text-muted-foreground/80">
                                    {stepFacts.join(' · ')}
                                  </span>
                                )}
                              </div>
                              {/* Row 2: the step's name, and — pushed to the
                                  far right — its condition.

                                  The condition used to be a THIRD line, so a
                                  card grew by a row the moment you gated it and
                                  a flow with one conditional step had one card
                                  taller than the rest. It is a qualifier on
                                  when the step runs, not a fact about the step,
                                  so the end of the name row is where it reads:
                                  "Submit Contract — only if …".

                                  Wraps under the name on narrow screens
                                  (flex-wrap); on desktop both rows are always
                                  present and nothing else is, so every card is
                                  exactly two lines tall. */}
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
                                {/* The description lives here now, on hover.
                                    Inline it ate the width the condition
                                    needed, and most steps have none — so the
                                    row was sized around something usually
                                    absent. Hover keeps it one keystroke away
                                    without spending a permanent column on it.

                                    On the name, not the whole card: the card
                                    is draggable, and a tooltip that follows a
                                    drag is noise. */}
                                {stepDescription ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className={cn(
                                          'min-w-0 truncate text-sm font-medium decoration-dotted underline-offset-4 hover:underline',
                                          !displayName && 'text-muted-foreground italic',
                                        )}
                                      >
                                        {displayName ?? placeholder}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" align="start" className="max-w-sm">
                                      {stepDescription}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span
                                    className={cn(
                                      'min-w-0 truncate text-sm font-medium',
                                      !displayName && 'text-muted-foreground italic',
                                    )}
                                  >
                                    {displayName ?? placeholder}
                                  </span>
                                )}
                                <span className="ml-auto shrink-0">
                                  <ExecutionOptionsSummary options={action.execution_options} />
                                </span>
                              </div>
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
                              onChanged={() => { if (selectedOrgId) void listLogins(selectedOrgId).then(setLogins).catch(() => {}); }}
                            />
                          </>
                        );
                      })()}
                    </div>

                    <FlowConnector />
                  </div>
                  );
                })}

                {/* The gap below the last step. Dropping on the bottom half of
                    the final card targets actions.length, which no per-card
                    line can draw. */}


                {/* Add Step.
                    The one thing you come to this page to do, and it was the
                    quietest element on it: a w-fit chip in muted grey, smaller
                    than the steps it adds to. Now it spans the step column so
                    it lines up with them, and carries the brand rather than
                    muted-foreground — an empty routine should draw the eye to
                    the way forward, not make you hunt for it. Still dashed, so
                    it stays legible as an affordance rather than a step. */}
                <button
                  type="button"
                  onClick={() => setActionTypeModalOpen(true)}
                  className="group w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand/40 bg-brand/[0.04] px-4 py-3 text-brand transition-colors hover:border-brand/70 hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <Plus className="h-4 w-4 transition-transform group-hover:scale-110" />
                  <span className="text-sm font-semibold">Add Step</span>
                </button>

              </div>
            </div>

            {/* Always last, and always present — the bookend to the Trigger
                bar at the top, and rendered OUTSIDE the inset step column so
                the two ends line up with each other rather than with the
                steps. It is NOT a step: it cannot pause the run, cannot fail
                it, and has no position to reorder. Defaulting to "Nothing"
                means its presence is a prompt rather than something to
                remember to add.

                The arrow is the same connector the steps use. Without it the
                bar's top edge landed flush on Add Step's bottom edge, which
                reads as overlapping — and it says what spacing alone did not:
                the outcome ends the same flow, it is not a detached panel. */}
            {selectedOrgId && (
              <>
                <FlowConnector />
                <OutcomeCard orgId={selectedOrgId} agentId={agentId} />
              </>
            )}
          </div>
      </div>
      )}

      {/* ── Settings ────────────────────────────────────────────
          A tab, not a modal. Same fields, same dirty tracking, same
          Save semantics — only the container moved. A dialog framed
          settings as a brief detour from the workflow, but they are
          the other half of what an agent IS, and a sheet over the
          flow meant you could not read one while editing the other.
          Same 720px reading column as the workflow, so switching
          tabs does not reflow the page under you. */}
      {activeTab === 'settings' && (
        <div className="mx-auto w-full max-w-[720px]">
          <div className="space-y-4">
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

            {/* Access sits in Settings, next to the other things that are
                true of the AGENT rather than of one step. It saves on click
                rather than on the dialog's Save, because it writes to its own
                table — bundling it into the agent row's dirty tracking would
                mean one Save doing two unrelated writes. */}
            {selectedOrgId && (
              <div className="space-y-1.5">
                <AgentAccessGroups orgId={selectedOrgId} agentId={agentId} />
              </div>
            )}

            <div className="space-y-1.5">
              {/* The picker can create a tag but not rename or delete one, so
                  the link hands off to the page that can. Placed beside the
                  label rather than inside the dropdown to match the group
                  picker below — two controls in one panel, one affordance
                  each, in the same spot. */}
              <div className="flex items-center justify-between gap-2">
                <Label>Tags</Label>
                <Link href="/tags" className="text-xs text-brand hover:underline">Manage tags</Link>
              </div>
              <TagPicker
                tags={allTags}
                selected={agentTagIds}
                onChange={(ids) => { setAgentTagIds(ids); setSettingsDirty(true); }}
                onCreate={(name) => createTag({ name })}
              />
            </div>

            {/* The product this agent is available in.
                This is still agents.client_id underneath — one kit client per
                product — but "Client" was the storage talking. Nobody was
                choosing a client; they were choosing which centre could run
                the agent, and the clients are now provisioned by the products
                themselves, so the product name is both truer and the only
                name an operator ever sees.

                SINGULAR, because the column is singular — agents.client_id
                holds one id. The label says so before the control does:
                "Products" over a single select reads as a list you have not
                filled in yet, and promises a many-to-many the schema does not
                have. If that changes, the name changes with it. */}
            <div className="rounded-md border px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Product</p>
                  <p className="text-xs text-muted-foreground">
                    {agent?.client_id
                      ? 'Runnable from this product’s agent kit, which passes _client_prompt / _client_media / _client_video to this agent.'
                      : products.length === 0
                        ? 'No products with an agent kit are enabled for this organization yet.'
                        : 'Pick a product to make this agent runnable from its agent kit.'}
                  </p>
                </div>
                <Select
                  value={agent?.client_id ?? NO_PRODUCT}
                  disabled={savingClient || products.length === 0}
                  onValueChange={(v) => handleSetClient(v === NO_PRODUCT ? null : v)}
                >
                  {/* h-[34px] because SelectTrigger's default is 36 and
                      <Input>'s is 34 — the panel follows Input. */}
                  <SelectTrigger className="w-56 h-[34px] shrink-0">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PRODUCT}>None</SelectItem>
                    {products.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{clientDisplayName(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

          </div>
          {/* No Close button: the Workflow tab is the way out, and a
              dead "Close" that only navigates would suggest the edits
              were discarded. Save stays disabled until something is
              actually dirty, so the row doubles as the dirty state. */}
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            {settingsDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <Button
              onClick={() => { void handleSaveSettings(); }}
              disabled={!settingsDirty || !agentName.trim() || savingSettings}
            >
              {savingSettings ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
        </div>
      </div>

      {/* ── Called by ──────────────────────────────────────────────
          Every agent that runs this one as a sub-agent step. Read-only: the
          relationship is owned by the CALLING agent's step list, so this is a
          way to FIND them, not to change them. Each row navigates there.

          Search is here because the count in the trigger row has no ceiling —
          a shared utility agent can be called by dozens, and a bare list of
          dozens is the same problem the inline names had, just moved. */}
      <Dialog open={calledByOpen} onOpenChange={setCalledByOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Also run by</DialogTitle>
          </DialogHeader>
          <p className="-mt-1 text-xs text-muted-foreground">
            These agents run <span className="font-medium text-foreground">{agent?.name}</span> as a
            step. It runs whenever they do, and each one decides its own batching.
          </p>

          {/* Only worth a search box once scanning stops being instant. */}
          {calledBy.length > 6 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={calledBySearch}
                onChange={(e) => setCalledBySearch(e.target.value)}
                placeholder="Search agents…"
                className="h-9 pl-7"
              />
            </div>
          )}

          <div className="-mx-1 max-h-[320px] overflow-y-auto px-1">
            {(() => {
              const q = calledBySearch.trim().toLowerCase();
              const rows = q ? calledBy.filter((p) => p.name.toLowerCase().includes(q)) : calledBy;
              if (rows.length === 0) {
                return <p className="py-6 text-center text-xs text-muted-foreground">No agents match that search.</p>;
              }
              return (
                <ul className="divide-y rounded-md border">
                  {rows.map((p) => (
                    <li key={p.agent_id}>
                      <Link
                        href={`/agents/${p.agent_id}`}
                        onClick={() => setCalledByOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                      >
                        <Bot className="h-3.5 w-3.5 shrink-0 text-brand" />
                        <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Action Dialog ─────────────────────────────────────── */}
      {/* Only the AI-step form has modes; every other action type opens
          straight onto its fields. */}
      <Sheet open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
          {/* Tabs live INSIDE the header, above its single border — the
              same shape ConfigSlideOut gives the outcome panel. They were
              the first thing in the body, which needed negative margins to
              escape the padding and left two hairlines for one boundary.
              pb-0 when tabs are present so their underline meets the border. */}
          <SheetHeader className={cn('border-b px-4 pt-4 sm:px-6', isAiStepAction ? 'gap-3 pb-0' : 'pb-4')}>
            <SheetTitle>
              {editingAction ? 'Edit' : 'Add'}{' '}
              {actionForm.action_type === 'approval' ? 'Human Review'
                : actionForm.action_type === 'login' ? 'Browser Login'
                : actionForm.action_type === 'browser_script' ? 'Browser Script'
                : actionForm.action_type === 'sub_agent' ? 'Run Agent'
                : 'AI Step'}
            </SheetTitle>
            {isAiStepAction && (
              <div className="-mx-0.5">
                <PanelTabs
                  tabs={[
                    { value: 'new',      label: 'New AI step' },
                    { value: 'existing', label: 'Use existing' },
                  ] as const}
                  value={aiStepMode}
                  onChange={(m) => {
                    if (m === 'new') {
                      // Keep aiStepId so switching back to "Use existing"
                      // restores the previous step; just blank the draft.
                      setAiStepMode('new');
                      setNewAiStepForm({ name: '', description: '', prompt: '', model: '', connector_ids: [], outputs: [], skill_ids: [] });
                      return;
                    }
                    setAiStepMode('existing');
                    // Default to the step already linked to this action (or
                    // the last selected one) rather than a blank selection.
                    const targetId = actionForm.aiStepId || editingAction?.ai_step_id || '';
                    if (targetId) {
                      const s = aiSteps.find((x) => x.id === targetId);
                      setActionForm(f => ({ ...f, aiStepId: targetId }));
                      if (s) setNewAiStepForm({ name: s.name, description: s.description ?? '', prompt: s.prompt, model: s.model, connector_ids: s.connector_ids ?? [], outputs: s.outputs ?? [], skill_ids: s.skill_ids ?? [] });
                    }
                  }}
                />
              </div>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
            {actionForm.action_type === 'agent' && (
              <>
                {/* Create a brand-new AI step (default) or edit an existing one
                    in place — the same editor as the standalone AI Step page. */}
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
                      setNewLoginForm({ name: '' });
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
                        if (l) setNewLoginForm({ name: l.name });
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
                        if (l) setNewLoginForm({ name: l.name });
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
                    {/* Carries the script's NAME as ?q= so the library opens
                        filtered to it. The list searches name and description,
                        and an exact name is the narrowest thing we can hand it
                        — the id is not searchable, and sending one would show
                        an empty list. */}
                    {actionForm.scriptId && (() => {
                      const picked = browserScripts.find((s) => s.id === actionForm.scriptId);
                      const href = picked
                        ? `/actions/browser-scripts?q=${encodeURIComponent(picked.name)}`
                        : '/actions/browser-scripts';
                      return (
                        <Link href={href} className="text-xs text-muted-foreground hover:underline">
                          Edit in Browser Skills →
                        </Link>
                      );
                    })()}
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
                {/* Straight to the chosen agent, not the directory. The
                    reason for clicking is always "let me look at THAT agent",
                    and the list then asks you to find again what you had
                    already selected. Falls back to the directory only when
                    nothing is picked yet, which is the one case where there is
                    no agent to open. */}
                <EntityPreviewNotice
                  entityLabel="sub-agent"
                  editHref={actionForm.targetAgentId ? `/agents/${actionForm.targetAgentId}` : '/agents'}
                  editLabel="Agents"
                  editText={actionForm.targetAgentId ? 'open it' : undefined}
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
                use them but the storage shape is uniform.

                SEPARATED, and said out loud. Everything above this line edits
                a REUSABLE entity — change the prompt here and every agent
                using that AI step changes with it — while everything below
                applies to this one use of it. The panel gave no sign of that,
                so the two read as one form and the blast radius of an edit
                was invisible. A dashed hairline was not enough to carry it. */}
            <div className="mt-5 space-y-2 rounded-md border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Only in this routine
              </p>
              <p className="text-[11px] text-muted-foreground">
                Applies to this step in this agent. Nothing here touches the reusable
                {' '}{actionForm.action_type === 'agent' ? 'AI step'
                    : actionForm.action_type === 'browser_script' ? 'script'
                    : actionForm.action_type === 'login' ? 'login'
                    : 'entity'} above.
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
                (actionForm.action_type === 'login' && !newLoginForm.name.trim()) ||
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
      <Dialog open={triggerDialogOpen} onOpenChange={closeTriggerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingTriggerId ? 'Edit Schedule' : 'Add Trigger'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Type</Label>
              {/* Locked while editing: switching type mid-edit would need the
                  webhook key lifecycle handled too, and the user asked only for
                  the schedule to be editable. Remove and re-add to change type. */}
              <Select value={triggerForm.trigger_type} disabled={!!editingTriggerId} onValueChange={(v) => setTriggerForm(f => ({ ...f, trigger_type: v }))}>
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
            <Button variant="outline" onClick={() => closeTriggerDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSaveTrigger}
              disabled={savingTrigger || (triggerForm.trigger_type === 'cron' && !triggerForm.cron_expr.trim())}
            >
              {savingTrigger
                ? (editingTriggerId ? 'Saving…' : 'Creating…')
                : (editingTriggerId ? 'Save Schedule' : 'Create Trigger')}
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

            {/* Browser Script.
                NO LONGER GATED. It sat behind a "browser mode" flag on the
                agent, with an Enable button to unlock it — but adding a
                browser script IS how an agent comes to need a browser, and
                the runtime now works that out from the steps themselves. The
                gate asked you to declare in advance the thing you were in the
                middle of doing, and the only way through it was to say yes.

                Standalone Browser Login is intentionally NOT an option: a
                login by itself does nothing. The login step gets auto-added
                when a browser_script linked to a login is added; remove the
                script and the paired login goes with it. */}
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
    </TooltipProvider>
  );
}
