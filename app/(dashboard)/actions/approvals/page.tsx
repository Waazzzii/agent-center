'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { listApprovalSteps, deleteApprovalStep, type ApprovalStep } from '@/lib/api/approval-steps';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Trash2, CheckCircle2, Loader2, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

/**
 * Approval Steps library — list view.
 *
 * Mirrors the AI Steps page structure (table + create button + per-row
 * delete) so operators have one mental model for managing the four
 * reusable-entity libraries (AI Steps, Logins, Browser Scripts,
 * Approvals).
 *
 * Deleting an approval step here doesn't delete agent_actions that
 * reference it — the FK is ON DELETE SET NULL. Those actions will
 * fall back to the "(no approval step selected)" placeholder until
 * the operator re-links them.
 */
export default function ApprovalStepsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();
  const router = useRouter();

  const [items, setItems] = useState<ApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);
  // Same shape as the logins and scripts lists: local search, local sort. The
  // set is small enough that a round trip per keystroke would be slower than
  // filtering what is already here.
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      setItems(await listApprovalSteps(selectedOrgId));
    } catch {
      toast.error('Failed to load approval steps');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (item: ApprovalStep) => {
    if (!selectedOrgId) return;
    const ok = await confirm({
      title: 'Delete approval step?',
      description: `"${item.name}" will be removed. Any agent actions referencing it will lose their approval definition — re-link or remove those steps after.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteApprovalStep(selectedOrgId, item.id);
      toast.success('Deleted');
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  // Name AND instructions, because an approval is usually remembered by what
  // it asks a person to check rather than by whatever it was named.
  const visible = items
    .filter((a) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return a.name.toLowerCase().includes(q)
          || (a.instructions ?? '').toLowerCase().includes(q);
    })
    // Numeric-aware so "Review 2" sorts before "Review 10".
    .sort((a, b) => {
      const c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      return sortDir === 'asc' ? c : -c;
    });

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-orange-500" /> Approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reusable human-review definitions. Each one carries the
            instructions shown to the approver plus an optional Slack
            channel for HITL notifications.
          </p>
        </div>
        <Button onClick={() => router.push('/actions/approvals/create')}>
          <Plus className="h-4 w-4 mr-1" /> New Approval
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No approvals yet. Create one to reuse human-review steps across agent workflows.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          {/* Both the toolbar and the table go in ONE CardContent. Card is
              `flex flex-col gap-6`; py-0 drops its padding but not its gap, so
              two children would put 24px between the filter bar and the first
              row. */}
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search approvals by name or instructions…"
                  className="h-9 pl-8"
                />
              </div>
              {search && (
                <span className="text-xs text-muted-foreground">{visible.length} of {items.length}</span>
              )}
            </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    title={`Sort ${sortDir === 'asc' ? 'Z→A' : 'A→Z'}`}
                  >
                    Name
                    {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  </button>
                </th>
                <th className="text-left font-medium px-4 py-2">Instructions</th>
                <th className="text-left font-medium px-4 py-2 w-40">Slack Override</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr className="border-t">
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nothing matches &ldquo;{search}&rdquo;.
                  </td>
                </tr>
              )}
              {visible.map((item) => (
                <tr
                  key={item.id}
                  className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/actions/approvals/${item.id}`)}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{item.name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[400px]">
                    {item.instructions ? item.instructions.slice(0, 100) : (
                      <span className="italic">No instructions configured</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {item.notification_slack_channel_id ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {item.notification_slack_channel_id}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive/50 hover:text-destructive"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
