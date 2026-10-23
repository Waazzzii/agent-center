'use client';

/**
 * Authorization → Clients → one client. THE single place to assign agents to a
 * client's tasks. The client's center has a task catalog (DB-backed); a guided
 * task exposes several ROLES, each getting its own agent. Assigning an agent to a
 * role also makes it belong to this client (agents.client_id) — so one screen
 * satisfies both gates the kit checks. (Replaces the old wazzi-frontend task tab
 * AND the bulk agent checklist.)
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getClient, getClientTaskRoles, setClientTaskRoles, clientDisplayName, type ClientTaskRoles, type TaskAgentValue } from '@/lib/api/clients';
import { Package, ArrowLeft, Loader2, Info, Check, ChevronsUpDown } from 'lucide-react';

type AssignableAgent = ClientTaskRoles['agents'][number];

// Task · Step · Agent column template (sm+), shared by the header and every task.
const GRID = 'sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_18rem]';
// The task cell spans its step rows (static classes so Tailwind emits them).
const ROW_SPAN: Record<number, string> = { 1: 'sm:row-span-1', 2: 'sm:row-span-2', 3: 'sm:row-span-3', 4: 'sm:row-span-4' };


export default function ClientDetailPage() {
  const { selectedOrgId } = useAdminViewStore();
  const isManager = useRequirePermission('agent_center_manager');
  const clientId = String(useParams().id);

  const [name, setName] = useState('Client');
  const [data, setData] = useState<ClientTaskRoles | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [draft, setDraft] = useState<Record<string, TaskAgentValue> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedOrgId || !isManager) return;
    setLoading(true); setNotConfigured(false);
    Promise.all([
      getClient(selectedOrgId, clientId).then((c) => setName(clientDisplayName(c))).catch(() => {}),
      getClientTaskRoles(selectedOrgId, clientId).then(setData).catch(() => setNotConfigured(true)),
    ]).finally(() => setLoading(false));
  }, [selectedOrgId, isManager, clientId]);

  const agents = data?.agents ?? [];
  const activeAgents = useMemo(() => agents.filter((a) => a.is_active), [agents]);

  if (!isManager) return <NoPermissionContent />;

  // Every task has ≥1 step and the endpoint returns { step: agentId } for all of
  // them, so one shape everywhere. Draft wins over the saved mapping.
  const stepsOf = (slug: string): Record<string, string | null> => {
    const cur = draft?.[slug] ?? data?.task_agents[slug];
    return cur && typeof cur === 'object' ? cur : {};
  };
  const valueFor = (slug: string, step: string): string => stepsOf(slug)[step] ?? '';

  const setValue = (slug: string, step: string, agentId: string) => {
    setDraft((prev) => ({ ...(prev ?? {}), [slug]: { ...stepsOf(slug), [step]: agentId } }));
  };

  const onSave = async () => {
    if (!selectedOrgId || !data) return;
    setSaving(true);
    try {
      // Whole-map write: every task, draft winning, empties dropped by the backend.
      const payload: Record<string, TaskAgentValue> = {};
      for (const t of data.tasks) {
        const steps: Record<string, string> = {};
        for (const r of t.roles) { const id = valueFor(t.slug, r.key); if (id) steps[r.key] = id; }
        payload[t.slug] = steps;
      }
      const next = await setClientTaskRoles(selectedOrgId, clientId, payload);
      setData(next); setDraft(null); setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1100px] mx-auto">
      <Link href="/authorization/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>
      <PageHeader icon={Package} title={name} description="Assign an agent to each step of each task. Assigning also makes that agent belong to this client." />

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : notConfigured ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          This client isn’t linked to a center yet, so it has no tasks to assign.
        </div>
      ) : !data || data.tasks.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No tasks registered for this center.</div>
      ) : (
        <>
          {activeAgents.length === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              No active agents in this org yet — create one in Agents, then assign it here.
            </div>
          )}
          {/* One grid for every task: Task · Step · Agent. The task cell spans its
              steps; on a phone it stacks (task, then step + agent per row). */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className={`hidden border-b bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid ${GRID}`}>
              <div>Task</div><div>Step</div><div>Agent</div>
            </div>
            <div className="divide-y">
              {data.tasks.map((t) => (
                <div key={t.slug} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 sm:gap-y-1 ${GRID}`}>
                  <div className={`col-span-2 min-w-0 sm:col-span-1 sm:self-start sm:pt-1.5 ${ROW_SPAN[Math.min(t.roles.length, 4)]}`}>
                    <div className="truncate text-sm font-medium text-foreground">{t.label}</div>
                    {t.description && <div className="truncate text-xs text-muted-foreground" title={t.description}>{t.description}</div>}
                  </div>
                  {t.roles.map((r) => {
                    const fallback = r.fallback ? t.roles.find((x) => x.key === r.fallback) : undefined;
                    return (
                      // Two grid cells (label, picker) → the Step and Agent columns.
                      <Fragment key={r.key}>
                        <div className="truncate text-sm text-muted-foreground">{r.label}</div>
                        <AgentCombobox
                          agents={activeAgents}
                          value={valueFor(t.slug, r.key)}
                          onChange={(id) => setValue(t.slug, r.key, id)}
                          clientId={clientId}
                          emptyLabel={fallback ? `Same as ${fallback.label}` : undefined}
                        />
                      </Fragment>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={onSave} disabled={saving || !draft}>{saving ? 'Saving…' : 'Save assignments'}</Button>
            {draft && <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>}
            {savedAt && !draft && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓</span>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Searchable, tag-filterable agent picker. The org's agent list gets long, so a
 * plain dropdown doesn't cut it — this is a combobox with a search box and the
 * agents' tags as toggle filters (match ANY selected tag).
 */
function AgentCombobox({
  agents,
  value,
  onChange,
  clientId,
  emptyLabel,
}: {
  agents: AssignableAgent[];
  value: string;
  onChange: (id: string) => void;
  clientId: string;
  /** Shown when unset instead of "Not assigned" (e.g. a step with a fallback). */
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const selected = agents.find((a) => a.id === value) ?? null;
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const a of agents) for (const t of a.tags ?? []) s.add(t.name);
    return [...s].sort((x, y) => x.localeCompare(y));
  }, [agents]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return agents.filter((a) => {
      const okQ = !needle || a.name.toLowerCase().includes(needle);
      const okTags = tagFilter.length === 0 || (a.tags ?? []).some((t) => tagFilter.includes(t.name));
      return okQ && okTags;
    });
  }, [agents, q, tagFilter]);

  const rowCls = 'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent';

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" className="h-8 w-full justify-between font-normal">
          <span className="truncate">
            {selected ? selected.name
              : emptyLabel ? <span className="text-muted-foreground">{emptyLabel}</span>
              : <span className="text-amber-600 dark:text-amber-400">Not assigned</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,90vw)] p-0">
        <div className="border-b p-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…" autoFocus className="h-8" />
          {allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {allTags.map((t) => {
                const on = tagFilter.includes(t);
                return (
                  <button key={t} type="button" onClick={() => setTagFilter((f) => (on ? f.filter((x) => x !== t) : [...f, t]))}>
                    <Badge variant={on ? 'default' : 'outline'} className="cursor-pointer">{t}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="max-h-64 overflow-auto p-1">
          <button type="button" className={rowCls} onClick={() => { onChange(''); setOpen(false); }}>
            <span className="text-muted-foreground">{emptyLabel ?? 'Not assigned'}</span>
            {!value && <Check className="h-4 w-4 shrink-0" />}
          </button>
          {filtered.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">No agents match.</div>
          ) : (
            filtered.map((a) => (
              <button key={a.id} type="button" className={rowCls} onClick={() => { onChange(a.id); setOpen(false); }}>
                <span className="min-w-0 flex-1 truncate">
                  {a.name}
                  {a.client_id && a.client_id !== clientId ? <span className="text-xs text-muted-foreground"> · moves client</span> : null}
                </span>
                {value === a.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
