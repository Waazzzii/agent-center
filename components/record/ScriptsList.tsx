'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, Pencil, Copy, Search, Tag as TagIcon, KeyRound } from 'lucide-react';
import { listScripts, deleteScript, createScript, updateScript, getScriptLoginUsage, type BrowserScript } from '@/lib/api/scripts';
import { RunScriptModal } from './RunScriptModal';
import { useTags } from '@/lib/hooks/use-tags';
import { TagFilter } from '@/components/tags/tag-filter';
import { TagList } from '@/components/tags/tag-badge';
import { TagAssignDialog } from '@/components/tags/tag-assign-dialog';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { LinkLoginDialog } from './LinkLoginDialog';

interface ScriptsListProps {
  orgId: string | null;
  /** Increment this to trigger a list refresh from the outside. */
  refreshKey?: number;
}

export function ScriptsList({ orgId, refreshKey }: ScriptsListProps) {
  const [scripts, setScripts] = useState<BrowserScript[]>([]);
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
  // Login + verify scripts belong to their login profile and are edited from
  // the login's own page, so they're hidden here by default. The toggle is a
  // debugging escape hatch — chasing a broken login script with no way to
  // open it from the list is painful.
  const [showLoginScripts, setShowLoginScripts] = useState(false);
  const [tagDialogScript, setTagDialogScript] = useState<BrowserScript | null>(null);
  const [linkLoginScript, setLinkLoginScript] = useState<BrowserScript | null>(null);

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
        // Login + login-check scripts belong to their login profile and are
        // edited from that login's page. Undefined = every kind (the toggle).
        kinds: showLoginScripts ? undefined : ['regular'],
      });
      setScripts(data.scripts ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load scripts');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, refreshKey, tagFilter, tagMatch, showLoginScripts]);

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
                {/* Escape hatch, not a primary filter — deliberately plain
                    and low-contrast so it doesn't compete with tag filtering. */}
                <label
                  className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none"
                  title="Login and verify scripts belong to a login profile and are normally edited from that login's page."
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-current cursor-pointer"
                    checked={showLoginScripts}
                    onChange={(e) => setShowLoginScripts(e.target.checked)}
                  />
                  Show login scripts
                </label>
                <TagFilter tags={tags} selected={tagFilter} onChange={setTagFilter} match={tagMatch} onMatchChange={setTagMatch} />
              </div>
            </div>
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
                  render: (s) => (
                    <div>
                      <span className="font-medium">{s.name}</span>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 max-w-[420px] truncate">{s.description}</p>
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
                  key: 'tags',
                  label: 'Tags',
                  thClassName: 'w-40',
                  tdClassName: 'w-40',
                  render: (s) => <TagList tags={s.tags} />,
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
                          { label: 'Tags', icon: <TagIcon className="h-4 w-4" />, onSelect: () => setTagDialogScript(s) },
                          // Linking lives here, not in the recorder toolbar:
                          // it rewrites the paired login step in every agent
                          // using this script, so it belongs with the script's
                          // configuration rather than a live browser session.
                          // Meaningless for login/login-check scripts, which
                          // ARE the login.
                          ...(s.kind === 'regular' ? [{
                            label: s.login_id ? 'Change linked login' : 'Link login',
                            icon: <KeyRound className="h-4 w-4" />,
                            onSelect: () => setLinkLoginScript(s),
                          }] : []),
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
                          { label: 'Tags', icon: <TagIcon className="h-4 w-4" />, onSelect: () => setTagDialogScript(s) },
                          // Linking lives here, not in the recorder toolbar:
                          // it rewrites the paired login step in every agent
                          // using this script, so it belongs with the script's
                          // configuration rather than a live browser session.
                          // Meaningless for login/login-check scripts, which
                          // ARE the login.
                          ...(s.kind === 'regular' ? [{
                            label: s.login_id ? 'Change linked login' : 'Link login',
                            icon: <KeyRound className="h-4 w-4" />,
                            onSelect: () => setLinkLoginScript(s),
                          }] : []),
                          { label: duplicatingId === s.id ? 'Duplicating…' : 'Duplicate', icon: <Copy className="h-4 w-4" />, disabled: duplicatingId === s.id, onSelect: () => handleDuplicate(s) },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => setScriptToDelete(s) },
                        ]}
                      />
                    </div>
                  ),
                },
              ]}
            />
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

      <LinkLoginDialog
        open={!!linkLoginScript}
        onClose={() => setLinkLoginScript(null)}
        orgId={orgId}
        script={linkLoginScript}
        onLinked={() => load()}
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
