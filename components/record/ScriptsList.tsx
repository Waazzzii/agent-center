'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Info, Plus, TriangleAlert } from 'lucide-react';
import { listLogins, type Login } from '@/lib/api/logins';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, Pencil, Copy, Search, KeyRound } from 'lucide-react';
import { listScripts, deleteScript, createScript, updateScript, getScriptLoginUsage, type BrowserScript, type ScriptKind } from '@/lib/api/scripts';
import { Switch } from '@/components/ui/switch';
import { RunScriptModal } from './RunScriptModal';
import { useTags } from '@/lib/hooks/use-tags';
import { TagFilter } from '@/components/tags/tag-filter';
import { TagList } from '@/components/tags/tag-badge';
import { TagAssignDialog } from '@/components/tags/tag-assign-dialog';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';

/**
 * A help affordance in a column header.
 *
 * Two of these columns configure behaviour that cannot be inferred from a
 * two-word label — and the explanation belongs once, in the header, rather than
 * repeated on every row or left to be discovered by flipping the control and
 * seeing what breaks.
 */
function HeaderHelp({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // Not a control: keep it out of the tab order, and stop the click
          // reaching the header's sort handler.
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
          aria-label="What this column does"
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs leading-snug font-normal">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A hover explanation attached to a CELL rather than a column header.
 *
 * Same primitive as HeaderHelp, but the trigger is whatever it wraps, so the
 * explanation sits on the thing that needs explaining instead of on a header
 * several columns away. Also replaces the native `title` attribute, which gives
 * an unstyled OS tooltip after a long delay and cannot hold a real sentence.
 */
function CellHint({ children, hint }: { children: React.ReactNode; hint: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-snug font-normal">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

interface ScriptsListProps {
  orgId: string | null;
  /** Increment this to trigger a list refresh from the outside. */
  refreshKey?: number;
  /**
   * Which script kinds to list. Defaults to the business scripts.
   *
   * A prop rather than a second component: login scripts want the same table,
   * the same search, the same sort and the same delete guard, and the one
   * column that does not apply to them (Login Required?) already renders "—"
   * for any non-regular kind. Forking this to get a different WHERE clause
   * would have duplicated ~600 lines to change one array.
   */
  kinds?: ScriptKind[];
}

export function ScriptsList({ orgId, refreshKey, kinds = ['regular'] }: ScriptsListProps) {
  const [scripts, setScripts] = useState<BrowserScript[]>([]);
  const [loginTogglePending, setLoginTogglePending] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Only gates the first-load spinner — filter/search reloads update in place.
  const [initialLoad, setInitialLoad] = useState(true);
  const [runModalScript, setRunModalScript] = useState<BrowserScript | null>(null);
  const [scriptToDelete, setScriptToDelete] = useState<BrowserScript | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Login-usage check for the delete-confirmation dialog. Set when the
  // dialog opens, used to render the "in use by N logins" warning and
  // gate the Delete button. null = loading; { verify: 0, auto_login: 0 } =
  // safe to delete; either count > 0 = blocked.
  const [deleteUsage, setDeleteUsage] = useState<{ verify: number; auto_login: number } | null>(null);
  // Per-script "currently being duplicated" state so the action button can
  // show a busy state without blocking the rest of the table.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  // Operator-typed filter against script name + description. Empty string =
  // show everything. Trimmed + lowercased once for the indexOf check.
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'created'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Tag filtering is server-side (refetch on change); search/sort stay local.
  const { tags } = useTags(orgId);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<'any' | 'all'>('any');
  // Login scripts are not listed in the DEFAULT mount. They have their own
  // page (same table, kinds={['login']}) reached from a login, because mixing
  // them into the business-script list gave every row a
  // "Login Required?" column that meant nothing for a third of them. The toggle
  // that used to reveal them was a filter for a distinction most people reading
  // this page do not have yet.
  const [tagDialogScript, setTagDialogScript] = useState<BrowserScript | null>(null);

  // Sorted + filtered view. Search is a substring match against name OR
  // description so operators who remember the description but not the exact
  // name still find it.
  const visibleScripts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? scripts.filter((s) =>
          s.name.toLowerCase().includes(needle) ||
          (s.description?.toLowerCase().includes(needle) ?? false))
      : scripts;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      else if (sortKey === 'created') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [scripts, search, sortKey, sortDir]);


  /**
   * Set a script's login binding from one control.
   *
   * Three meaningful states, which previously needed a toggle AND a buried menu
   * item that each wrote half of them:
   *
   *   none      → requires_login false, login_id null
   *   'any'     → requires_login true,  login_id null   (shared across identities:
   *               every agent action must name its own login)
   *   <loginId> → requires_login true,  login_id set    (that login is also the
   *               editor's default for record/test)
   *
   * Collapsing them is not just tidier: a toggle for "needs a login" sitting
   * next to a hidden "change linked login" made it possible to set one without
   * the other, and requires_login=false with a login_id is a state that means
   * nothing.
   *
   * Note this does NOT touch existing agent actions — those carry their own
   * login_id, which is the runtime authority. Changing the editor default here
   * cannot repoint a running agent.
   */
  async function handleToggleRequiresLogin(script: BrowserScript, next: boolean) {
    if (!orgId) return;
    setLoginTogglePending(script.id);
    // Optimistic: the switch has to move under the finger, and the reload
    // below is the source of truth either way.
    setScripts((prev) => prev.map((x) => (x.id === script.id ? { ...x, requires_login: next } : x)));
    try {
      await updateScript(orgId, script.id, { requires_login: next });
      toast.success(
        next
          ? `"${script.name}" now requires a login — agent actions using it must choose one`
          : `"${script.name}" no longer requires a login`,
      );
    } catch (err: any) {
      setScripts((prev) => prev.map((x) => (x.id === script.id ? { ...x, requires_login: !next } : x)));
      toast.error(err?.response?.data?.error || err?.message || 'Failed to update script');
    } finally {
      setLoginTogglePending(null);
    }
  }

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key as 'name' | 'created'); setSortDir('asc'); }
  };

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await listScripts(orgId, {
        tagIds: tagFilter,
        tagMatch,
        // Defaults to business scripts. The login-script manager passes
        // ['login'] — same table, different pool.
        kinds,
      });
      setScripts(data.scripts ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load scripts');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  // Fetched once here rather than by each row, which would be one request per
  // script for a list that is identical for all of them.
  useEffect(() => {
    if (!orgId) return;
  }, [orgId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, refreshKey, tagFilter, tagMatch]);

  /**
   * Duplicate a script — copies name + steps + parameters + test_values
   * into a brand-new script via the existing createScript endpoint. We
   * append "(copy)" / "(copy N)" to the name so the list stays scannable
   * and the user can rename inline (via the modal or step list) afterward.
   */
  const handleDuplicate = async (script: BrowserScript) => {
    if (!orgId || duplicatingId) return;
    setDuplicatingId(script.id);
    try {
      // Find the next "(copy N)" suffix that isn't already taken. Avoids
      // ending up with "Foo (copy) (copy) (copy)" if the operator duplicates
      // the same script multiple times.
      const base = script.name.replace(/\s*\(copy(?:\s+\d+)?\)\s*$/, '');
      const existing = new Set(scripts.map((s) => s.name));
      let candidate = `${base} (copy)`;
      let n = 2;
      while (existing.has(candidate)) {
        candidate = `${base} (copy ${n})`;
        n++;
      }
      await createScript(orgId, {
        name: candidate,
        description: script.description,
        steps: script.steps,
        parameters: script.parameters,
        test_values: script.test_values,
        tag_ids: script.tags?.map((t) => t.id),
      });
      toast.success(`Duplicated → ${candidate}`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to duplicate script');
    } finally {
      setDuplicatingId(null);
    }
  };

  // Fetch login-usage when the delete dialog opens so we can show the
  // "this script is in use" warning before the operator attempts delete.
  useEffect(() => {
    if (!orgId || !scriptToDelete) {
      setDeleteUsage(null);
      return;
    }
    let cancelled = false;
    setDeleteUsage(null);
    getScriptLoginUsage(orgId, scriptToDelete.id)
      .then((usage) => { if (!cancelled) setDeleteUsage(usage); })
      .catch(() => { if (!cancelled) setDeleteUsage({ verify: 0, auto_login: 0 }); });
    return () => { cancelled = true; };
  }, [orgId, scriptToDelete]);

  const handleDeleteConfirm = async () => {
    if (!orgId || !scriptToDelete) return;
    setIsDeleting(true);
    try {
      await deleteScript(orgId, scriptToDelete.id);
      toast.success('Script deleted');
      setScriptToDelete(null);
      await load();
    } catch (err: any) {
      // Backend returns 409 + { usage: { verify, auto_login } } when a login
      // still references this script. Surface that to the operator with a
      // clear message — they need to reassign those logins first.
      const usage = err?.response?.data?.usage;
      if (err?.response?.status === 409 && usage) {
        const verify = usage.verify ?? 0;
        const autoLogin = usage.auto_login ?? 0;
        const parts: string[] = [];
        if (verify > 0)    parts.push(`${verify} login${verify === 1 ? '' : 's'} as verify script`);
        if (autoLogin > 0) parts.push(`${autoLogin} login${autoLogin === 1 ? '' : 's'} as auto-login script`);
        toast.error(
          `Cannot delete — this script is in use by ${parts.join(' and ')}. ` +
          `Edit those logins and pick a different script first.`,
          { duration: 8000 }
        );
      } else {
        toast.error(err?.response?.data?.error || err?.message || 'Failed to delete script');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {initialLoad ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or description…"
                  className="h-9 pl-8"
                />
              </div>
              {search && (
                <span className="text-xs text-muted-foreground">{visibleScripts.length} of {scripts.length}</span>
              )}
              <div className="ml-auto flex items-center gap-3">
                <TagFilter tags={tags} selected={tagFilter} onChange={setTagFilter} match={tagMatch} onMatchChange={setTagMatch} />
              </div>
            </div>
            <TooltipProvider delayDuration={200}>
            <ResponsiveTable
              data={visibleScripts}
              getRowKey={(s) => s.id}
              onRowClick={(s) => setRunModalScript(s)}
              emptyMessage={search ? `No scripts match "${search}".` : 'No scripts saved yet. Click Record above to create one.'}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  sortable: true,
                  // Bounded rather than absorbing everything. Script names run
                  // long and similar ("Create Work Order (Near-term Date)"), so
                  // they need real room — but left width-less this column took
                  // the entire surplus and on a wide screen that is mostly empty
                  // space. Tune this number, not the other columns.
                  thClassName: 'w-96',
                  tdClassName: 'w-96',
                  render: (s) => (
                    <div className="min-w-0">
                      <span className="font-medium">{s.name}</span>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.description}</p>
                      )}
                    </div>
                  ),
                },
                {
                  // ResponsiveTable is table-fixed: give the compact columns
                  // explicit widths so the no-width Name column absorbs the
                  // surplus and renders widest. (w-px would collapse a column
                  // to ~1px and overflow into neighbors — only valid for the
                  // icon actions column.)
                  key: 'params',
                  label: 'Params',
                  thClassName: 'w-16',
                  tdClassName: 'w-16',
                  render: (s) => {
                    const n = Object.keys(s.parameters ?? {}).length;
                    return <span className="tabular-nums text-muted-foreground">{n === 0 ? '—' : n}</span>;
                  },
                },
                {
                  key: 'steps',
                  label: 'Steps',
                  thClassName: 'w-16',
                  tdClassName: 'w-16',
                  render: (s) => <span className="tabular-nums text-muted-foreground">{s.steps.length}</span>,
                },
                {
                  key: 'created',
                  label: 'Created',
                  sortable: true,
                  thClassName: 'w-24',
                  tdClassName: 'w-24',
                  render: (s) => <span className="text-muted-foreground whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</span>,
                },
                {
                  key: 'requires_login',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      Login Required?
                      <HeaderHelp>
                        Whether this script needs an authenticated browser. When on, every
                        routine step using this script must choose a login before it will
                        run — which is what lets one script serve several identities (eight
                        markets, one scrape).
                        {' '}<em>Which</em> login is chosen in the routine, never here. To sign
                        the editor in while working on a script, use the login picker inside it.
                      </HeaderHelp>
                    </span>
                  ),
                  thClassName: 'w-32',
                  tdClassName: 'w-32',
                  render: (s) => (
                    s.kind !== 'regular' ? (
                      // A login script performs the authentication; it cannot
                      // itself run inside one.
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      // The toggle speaks for itself — "Required / Not required"
                      // beside it only repeated its state in words and cost the
                      // column most of its width.
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                        <Switch
                          checked={s.requires_login === true}
                          disabled={loginTogglePending === s.id}
                          onCheckedChange={(v) => handleToggleRequiresLogin(s, v)}
                          aria-label={`Login required for ${s.name}`}
                        />
                        {/* Without an indicator this script cannot tell a live
                            session from a sign-in page — it would run against the
                            login form and report whatever it found there. Shown
                            here because the list is where you can see, in one
                            pass, what is still left to fix. */}
                        {s.requires_login === true && !s.steps.some((st) => st.login_indicator === true) && (
                          <CellHint
                            hint={
                              <span className="space-y-1">
                                <span className="block font-medium">No step proves the session</span>
                                <span className="block">
                                  A script behind a login needs one step marked as the proof it is
                                  signed in — something that only succeeds once authenticated, like
                                  waiting for the app&apos;s own navigation.
                                </span>
                                <span className="block">
                                  That step is what decides whether a login is attempted: if it
                                  fails, the script signs in and starts again. Without it, the
                                  script runs against the sign-in page and reports success.
                                </span>
                                <span className="block text-muted-foreground">
                                  Open the script, right-click that step, and choose
                                  “Proves we are signed in”.
                                </span>
                              </span>
                            }
                          >
                            <span
                              className="inline-flex shrink-0 cursor-help items-center text-amber-600 dark:text-amber-500"
                              aria-label="No step proves the session"
                            >
                              <TriangleAlert className="h-3.5 w-3.5" />
                            </span>
                          </CellHint>
                        )}
                      </div>
                    )
                  ),
                },
                {
                  key: 'tags',
                  label: (
                    <span className="inline-flex items-center gap-1">
                      Tags
                      <HeaderHelp>
                        Free-form labels for grouping and filtering. Click a row&apos;s tag area
                        to edit them.
                      </HeaderHelp>
                    </span>
                  ),
                  // Compact and fixed. Almost every script carries ONE tag, so a
                  // column sized for several spent most of its width on nothing
                  // while the name beside it was being truncated. One chip shows,
                  // the rest collapse into a "+N" whose tooltip lists them all.
                  thClassName: 'w-36',
                  tdClassName: 'w-36',
                  render: (s) => (
                    <CellHint
                      hint={
                        <span className="space-y-1">
                          <span className="block font-medium">
                            {s.tags?.length ? s.tags.map((t) => t.name).join(', ') : 'No tags yet'}
                          </span>
                          <span className="block">
                            Free-form labels for grouping and filtering — click to edit. Only the
                            first is shown here; the rest collapse into a count.
                          </span>
                        </span>
                      }
                    >
                    <div
                      // Editable in place rather than buried in the ⋮ menu. Tagging
                      // is the kind of thing done to several rows in a row, and a
                      // two-click detour per row is what stops it happening at all.
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setTagDialogScript(s); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setTagDialogScript(s);
                        }
                      }}
                      className="group/tags -mx-1 flex min-h-7 min-w-0 cursor-pointer flex-nowrap items-center gap-1 overflow-hidden rounded px-1 py-0.5 hover:bg-muted/60 transition-colors"
                    >
                      {s.tags?.length ? (
                        // No "+" alongside an existing chip. The whole cell is
                        // already the button, so the plus added a second thing to
                        // aim at for the same result — and sitting next to a pill
                        // it read as another tag rather than an action.
                        <TagList tags={s.tags} max={1} className="flex-nowrap min-w-0" />
                      ) : (
                        // Hover-only, and shaped like a tag so it reads as "a tag
                        // goes here". Dashed to say it is a placeholder, not one.
                        // Hidden at rest keeps the column quiet on the many rows
                        // that will never be tagged.
                        <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/tags:opacity-100">
                          <Plus className="h-3 w-3 shrink-0" />
                          <span className="truncate">Add tag</span>
                        </span>
                      )}
                    </div>
                    </CellHint>
                  ),
                },
                {
                  key: 'actions',
                  label: '',
                  thClassName: 'w-px whitespace-nowrap',
                  tdClassName: 'w-px whitespace-nowrap',
                  desktopRender: (s) => (
                    <div className="flex items-center justify-end">
                      <RowActionsMenu
                        actions={[
                          { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => setRunModalScript(s) },
                          // Linking lives here, not in the recorder toolbar:
                          // it rewrites the paired login step in every agent
                          // using this script, so it belongs with the script's
                          // configuration rather than a live browser session.
                          // Meaningless for login/login-check scripts, which
                          // ARE the login.
                          { label: duplicatingId === s.id ? 'Duplicating…' : 'Duplicate', icon: <Copy className="h-4 w-4" />, disabled: duplicatingId === s.id, onSelect: () => handleDuplicate(s) },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => setScriptToDelete(s) },
                        ]}
                      />
                    </div>
                  ),
                  render: (s) => (
                    <div className="flex items-center">
                      <RowActionsMenu
                        actions={[
                          { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => setRunModalScript(s) },
                          // Linking lives here, not in the recorder toolbar:
                          // it rewrites the paired login step in every agent
                          // using this script, so it belongs with the script's
                          // configuration rather than a live browser session.
                          // Meaningless for login/login-check scripts, which
                          // ARE the login.
                          { label: duplicatingId === s.id ? 'Duplicating…' : 'Duplicate', icon: <Copy className="h-4 w-4" />, disabled: duplicatingId === s.id, onSelect: () => handleDuplicate(s) },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => setScriptToDelete(s) },
                        ]}
                      />
                    </div>
                  ),
                },
              ]}
            />
            </TooltipProvider>
          </CardContent>
        </Card>
      )}

      <RunScriptModal
        script={runModalScript}
        orgId={orgId}
        open={!!runModalScript}
        onClose={() => { setRunModalScript(null); load(); }}
        onSaved={() => load()}
      />


      <TagAssignDialog
        open={!!tagDialogScript}
        onOpenChange={(o) => { if (!o) setTagDialogScript(null); }}
        orgId={orgId}
        entityLabel={tagDialogScript?.name}
        initialTagIds={tagDialogScript?.tags?.map((t) => t.id) ?? []}
        onSave={async (ids) => {
          if (!orgId || !tagDialogScript) return;
          await updateScript(orgId, tagDialogScript.id, { tag_ids: ids });
          await load();
        }}
      />

      <Dialog open={!!scriptToDelete} onOpenChange={(o) => !o && setScriptToDelete(null)}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete script?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{scriptToDelete?.name}</strong> will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* In-use warning. Renders when at least one login references the
              script (verify or auto-login). Delete button is disabled so the
              operator can't even attempt the destructive call — they must
              first unlink the script from those logins. */}
          {deleteUsage && (deleteUsage.verify > 0 || deleteUsage.auto_login > 0) && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-medium mb-1">This script is in use and cannot be deleted</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {deleteUsage.verify > 0 && (
                  <li>{deleteUsage.verify} login{deleteUsage.verify === 1 ? '' : 's'} use it as the <strong>verify script</strong></li>
                )}
                {deleteUsage.auto_login > 0 && (
                  <li>{deleteUsage.auto_login} login{deleteUsage.auto_login === 1 ? '' : 's'} use it as the <strong>auto-login script</strong></li>
                )}
              </ul>
              <p className="mt-2 opacity-80">Edit those logins and select a different script first, then come back to delete.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setScriptToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={
                isDeleting
                || deleteUsage === null  // still checking
                || (deleteUsage.verify > 0 || deleteUsage.auto_login > 0)
              }
              title={
                deleteUsage && (deleteUsage.verify > 0 || deleteUsage.auto_login > 0)
                  ? 'Script is in use — reassign affected logins first'
                  : undefined
              }
            >
              {isDeleting ? 'Deleting…' : deleteUsage === null ? 'Checking…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
