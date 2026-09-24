'use client';

/**
 * Picking ONE agent out of many.
 *
 * A dropdown stops working somewhere around thirty agents, and an org can
 * have hundreds. This is a dialog: a search box that filters as you type
 * across name and description, a tag filter for the orgs that organise
 * agents that way, and rows that show enough (description, active state,
 * tags) to tell two similarly named agents apart without opening either.
 *
 * Two pieces:
 *   AgentPickerDialog — the modal. Single select; Enter picks the
 *     highlighted row, Escape closes.
 *   AgentPickerField  — the control that lives in a form: shows the chosen
 *     agent as a card with a Change/Clear affordance, or a "Choose an
 *     agent…" button when empty. Opens the dialog.
 *
 * Used for a completion rule's follow-on agent and for a Run Agent step's
 * target — one way to pick an agent, wherever an agent is picked.
 */

import * as React from 'react';
import { Bot, Search, Check, X, ChevronsUpDown, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TagList } from '@/components/tags/tag-badge';
import type { Agent } from '@/lib/api/agents';
import { cn } from '@/lib/utils';

export function AgentPickerDialog({
  open, onOpenChange, agents, value, onSelect, title = 'Choose an agent', description, emptyHint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  value?: string | null;
  onSelect: (agentId: string) => void;
  title?: string;
  description?: string;
  /** Why the list might be shorter than expected — e.g. a nesting rule. */
  emptyHint?: string;
}) {
  const [query, setQuery] = React.useState('');
  const [tagId, setTagId] = React.useState<string | null>(null);
  const [cursor, setCursor] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Every tag in use across the agents offered, for the filter row.
  const tags = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color?: string | null }>();
    for (const a of agents) for (const t of a.tags ?? []) if (!seen.has(t.id)) seen.set(t.id, t);
    return [...seen.values()].sort((x, y) => x.name.localeCompare(y.name));
  }, [agents]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents
      .filter((a) => !tagId || (a.tags ?? []).some((t) => t.id === tagId))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q))
      // Active first, then by name — an inactive agent is rarely what you want.
      .sort((x, y) => Number(y.is_active) - Number(x.is_active) || x.name.localeCompare(y.name));
  }, [agents, query, tagId]);

  React.useEffect(() => { setCursor(0); }, [query, tagId]);
  React.useEffect(() => {
    if (!open) { setQuery(''); setTagId(null); setCursor(0); }
  }, [open]);

  const pick = (id: string) => { onSelect(id); onOpenChange(false); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && visible[cursor]) { e.preventDefault(); pick(visible[cursor].id); }
  };

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" onKeyDown={onKey}>
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-2.5 border-b px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or description…"
              className="pl-9"
            />
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setTagId(null)}
                className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors', !tagId ? 'border-brand/40 bg-brand-soft text-brand-soft-fg' : 'text-muted-foreground hover:text-foreground')}
              >
                All
              </button>
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTagId(tagId === t.id ? null : t.id)}
                  className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors', tagId === t.id ? 'border-brand/40 bg-brand-soft text-brand-soft-fg' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              <p>No agents match.</p>
              {emptyHint && <p className="mt-1 text-xs">{emptyHint}</p>}
            </div>
          ) : (
            <ul className="divide-y">
              {visible.map((a, i) => {
                const selected = a.id === value;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      data-index={i}
                      onClick={() => pick(a.id)}
                      onMouseEnter={() => setCursor(i)}
                      className={cn(
                        'flex w-full items-start gap-3 px-5 py-2.5 text-left transition-colors',
                        i === cursor && 'bg-muted/50',
                        selected && 'bg-brand-soft/40',
                      )}
                    >
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-soft-fg">
                        <Bot className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="truncate text-sm font-medium">{a.name}</span>
                          {!a.is_active && <Badge variant="neutral" className="h-5 px-1.5 text-[10px]">Inactive</Badge>}
                        </span>
                        {a.description && <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{a.description}</span>}
                        {(a.tags?.length ?? 0) > 0 && <span className="mt-1 block"><TagList tags={a.tags!} max={3} /></span>}
                      </span>
                      {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-brand" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t bg-surface-2/50 px-5 py-2.5 text-xs text-muted-foreground">
          <span>{visible.length} of {agents.length} agent{agents.length === 1 ? '' : 's'}</span>
          <span className="hidden sm:inline">↑↓ to move · Enter to choose</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AgentPickerField({
  agents, value, onChange, placeholder = 'Choose an agent…', clearable = true, dialogTitle, dialogDescription, emptyHint, disabled,
}: {
  agents: Agent[];
  value: string;
  onChange: (agentId: string) => void;
  placeholder?: string;
  /** Allow going back to "no agent". */
  clearable?: boolean;
  dialogTitle?: string;
  dialogDescription?: string;
  emptyHint?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = agents.find((a) => a.id === value);

  return (
    <>
      {selected ? (
        <div className="flex items-center gap-3 rounded-[var(--r-md)] border bg-card px-3 py-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-soft-fg">
            <Bot className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{selected.name}</span>
              {!selected.is_active && <Badge variant="neutral" className="h-5 px-1.5 text-[10px]">Inactive</Badge>}
            </span>
            {selected.description && <span className="line-clamp-1 block text-xs text-muted-foreground">{selected.description}</span>}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={disabled}>Change</Button>
          {clearable && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange('')} aria-label="Clear agent" disabled={disabled} className="text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="w-full justify-between font-normal text-muted-foreground"
        >
          <span className="flex items-center gap-2"><Bot className="h-4 w-4" />{placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      )}
      <AgentPickerDialog
        open={open}
        onOpenChange={setOpen}
        agents={agents}
        value={value}
        onSelect={onChange}
        title={dialogTitle}
        description={dialogDescription}
        emptyHint={emptyHint}
      />
    </>
  );
}
