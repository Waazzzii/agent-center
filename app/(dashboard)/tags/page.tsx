'use client';

/**
 * Tags — the org's vocabulary, and the only place it can be pruned.
 *
 * Tags could be CREATED from any picker and then never removed: the picker
 * that made one had no reason to offer deleting it, so a typo'd tag was
 * permanent and the list only ever grew. This page is the counterweight, and
 * it is deliberately the same shape as Authorization — both are small org-wide
 * vocabularies that agents reference, managed away from the agents themselves.
 *
 * WHAT A DELETE COSTS IS SHOWN BEFORE IT HAPPENS. A tag spans agents, AI
 * steps, browser scripts and logins, so "12 uses" could mean twelve agents or
 * one agent and eleven steps. The row shows the breakdown and the confirm
 * repeats it, because the assignments go with the tag and there is no undo.
 *
 * Renaming and recolouring share one inline editor rather than getting a row
 * of ten swatches each. Ten colour dots per row, on every row, would out-weigh
 * the tag names they belong to — and colour is set once when a tag is created
 * and almost never revisited.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { listTags, createTag, updateTag, deleteTag, type Tag } from '@/lib/api/tags';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TagBadge } from '@/components/tags/tag-badge';
import { TAG_COLORS, tagSwatchClass } from '@/components/tags/tag-colors';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Tags as TagsIcon, Search, Loader2, Pencil, Check, X } from 'lucide-react';

/** The entity types a tag can be attached to, in the order the row lists them. */
const USAGE_PARTS: { key: keyof Tag; singular: string; plural: string }[] = [
  { key: 'agent_count',   singular: 'agent',          plural: 'agents' },
  { key: 'ai_step_count', singular: 'AI step',        plural: 'AI steps' },
  { key: 'script_count',  singular: 'browser script', plural: 'browser scripts' },
  { key: 'login_count',   singular: 'login',          plural: 'logins' },
];

/**
 * "3 agents · 1 AI step", or null when nothing uses the tag.
 *
 * Falls back to the plain total when the per-type breakdown is missing. The
 * breakdown is newer than `usage_count`, so a frontend talking to a backend
 * that predates it would see every key undefined — and reporting "Not used"
 * for a tag that is on a dozen agents is the one wrong answer this function
 * must never give, because it is what the delete confirm repeats back.
 */
function describeUsage(tag: Tag): string | null {
  const hasBreakdown = USAGE_PARTS.some(({ key }) => typeof tag[key] === 'number');
  if (!hasBreakdown) {
    const total = tag.usage_count ?? 0;
    return total > 0 ? `${total} use${total === 1 ? '' : 's'}` : null;
  }
  const bits = USAGE_PARTS
    .map(({ key, singular, plural }) => {
      const n = (tag[key] as number | undefined) ?? 0;
      return n > 0 ? `${n} ${n === 1 ? singular : plural}` : null;
    })
    .filter(Boolean);
  return bits.length > 0 ? bits.join(' · ') : null;
}

/** The palette, as a row of swatches. Shared by the create bar and the editor. */
function ColorRow({
  value, onChange, size = 'h-5 w-5',
}: {
  value: string | null;
  onChange: (key: string) => void;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {TAG_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          aria-label={c.label}
          title={c.label}
          className={cn(
            'rounded-full transition-transform',
            size,
            tagSwatchClass(c.key),
            value === c.key
              ? 'scale-110 ring-2 ring-brand ring-offset-1 ring-offset-background'
              : 'opacity-60 hover:opacity-100',
          )}
        />
      ))}
    </div>
  );
}

export default function TagsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[0].key);
  const [creating, setCreating] = useState(false);

  // Inline rename + recolour. `editing` holds the tag id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      setTags(await listTags(selectedOrgId));
    } catch (err) {
      toast.error((err as Error).message || 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
  }, [tags, search]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!selectedOrgId || !name || creating) return;
    // Checked here as well as server-side: a duplicate is the most likely way
    // to get this wrong, and a toast beats a 400 with the field still full.
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`"${name}" already exists`);
      return;
    }
    setCreating(true);
    try {
      await createTag(selectedOrgId, { name, color: newColor });
      setNewName('');
      await load();
    } catch (err) {
      toast.error((err as Error).message || 'Could not create tag');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditing(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const handleSaveEdit = async (tag: Tag) => {
    const name = editName.trim();
    if (!selectedOrgId || !name) return;
    if (name === tag.name && editColor === tag.color) { setEditing(null); return; }
    setSavingEdit(true);
    try {
      await updateTag(selectedOrgId, tag.id, { name, color: editColor });
      setEditing(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message || 'Could not update tag');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (!selectedOrgId) return;
    const usage = describeUsage(tag);
    const ok = await confirm({
      title: `Delete "${tag.name}"?`,
      description: usage
        ? `This tag is on ${usage}. Deleting it removes the tag from all of them — nothing else about those items changes. This cannot be undone.`
        : 'Nothing is using this tag, so deleting it changes nothing else. This cannot be undone.',
      confirmText: 'Delete tag',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteTag(selectedOrgId, tag.id);
      toast.success(`Deleted "${tag.name}"`);
      await load();
    } catch (err) {
      toast.error((err as Error).message || 'Could not delete tag');
    }
  };

  if (allowed === false) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TagsIcon className="h-5 w-5 text-brand" /> Tags
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          The labels you put on agents, steps and scripts. They can be created from any tag picker —
          this is where they get renamed, recoloured and removed.
        </p>
      </div>

      {/* Create */}
      <Card className="py-0">
        <CardContent className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
              placeholder="New tag name…"
              className="h-9 w-56"
            />
            {/* Colour is chosen up front because it is what makes a tag
                scannable in a table later, and nobody goes back to set it. */}
            <ColorRow value={newColor} onChange={setNewColor} />
            <Button size="sm" onClick={() => void handleCreate()} disabled={!newName.trim() || creating}>
              {creating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Add tag
            </Button>

            <div className="relative ml-auto">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tags…"
                className="h-9 pl-7 w-48"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tags.length === 0 ? 'No tags yet. Add one above.' : 'No tags match that search.'}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((tag) => {
                const usage = describeUsage(tag);
                const agentCount = tag.agent_count ?? 0;
                const isEditing = editing === tag.id;

                return (
                  <li key={tag.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveEdit(tag);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          className="h-8 w-56"
                        />
                        <ColorRow value={editColor} onChange={setEditColor} size="h-4 w-4" />
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={savingEdit || !editName.trim()}
                          onClick={() => void handleSaveEdit(tag)}
                        >
                          {savingEdit
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                          <TagBadge tag={tag} />
                          <span className="text-xs text-muted-foreground truncate">
                            {usage ?? 'Not used'}
                          </span>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {/* Only offered when there is something to see — a
                              link to an empty filtered list is a dead end. */}
                          {agentCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => router.push(`/agents?tag_ids=${tag.id}`)}
                            >
                              View {agentCount} agent{agentCount === 1 ? '' : 's'}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Rename or recolour"
                            aria-label={`Edit ${tag.name}`}
                            onClick={() => startEdit(tag)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Delete"
                            aria-label={`Delete ${tag.name}`}
                            onClick={() => void handleDelete(tag)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
