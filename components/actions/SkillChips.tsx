'use client';

import { useState } from 'react';
import { createSkill, updateSkill, type Skill } from '@/lib/api/skills';
import { SkillFormBody, type SkillFormData } from './SkillFormBody';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Sparkles, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const BLANK: SkillFormData = { name: '', description: '', content: '' };

interface SkillChipsProps {
  orgId: string | null;
  skills: Skill[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onSkillsChanged?: () => void;
  readOnly?: boolean;
  variant?: 'inline' | 'attached';
}

/**
 * Skills as clickable bubbles. In the workflow ('attached'), skills live in a
 * fixed one-third-width slot as a carousel of cards — rotate through them, each
 * with a hover-remove, plus a big "+" to add. Clicking a bubble (or "+") opens a
 * right slide-out that manages ALL of the step's skills at once: pick which to
 * edit, add another (new or existing), or remove.
 */
export function SkillChips({ orgId, skills, selectedIds, onChange, onSkillsChanged, readOnly = false, variant = 'inline' }: SkillChipsProps) {
  const [sheet, setSheet] = useState<{ focusId?: string; add?: boolean } | null>(null);
  const [idx, setIdx] = useState(0);
  const byId = new Map(skills.map((s) => [s.id, s]));
  const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean) as Skill[];

  const sheetNode = sheet && orgId ? (
    <SkillManagerSheet
      orgId={orgId}
      skills={skills}
      selectedIds={selectedIds}
      focusId={sheet.focusId}
      startAdd={sheet.add}
      onClose={() => setSheet(null)}
      onChange={onChange}
      onSkillsChanged={onSkillsChanged}
    />
  ) : null;

  if (variant === 'attached') {
    const n = selected.length;
    const pos = Math.min(idx, Math.max(0, n - 1));
    const cur = n > 0 ? selected[pos] : null;

    const plus = !readOnly ? (
      <button
        type="button"
        title="Add a skill"
        onClick={(e) => { e.stopPropagation(); setSheet({ add: true }); }}
        className="inline-flex shrink-0 items-center gap-1 self-stretch rounded-lg border border-dashed px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} /> Add Skill
      </button>
    ) : null;

    if (n === 0) return <>{plus}{sheetNode}</>;

    return (
      <>
        <div className="flex min-w-0 shrink-0 grow-0 basis-1/3 items-center gap-1.5">
          {/* Whole pill is clickable (opens the manager on the current skill), like the step card. */}
          <div
            onClick={(e) => { e.stopPropagation(); if (!readOnly) setSheet({ focusId: cur!.id }); }}
            title={cur!.description || cur!.name}
            className={cn(
              'group relative flex min-w-0 flex-1 items-center gap-0.5 self-stretch rounded-[var(--r-xl)] border bg-card pl-2 pr-1 shadow-[var(--shadow-sm)] transition-colors',
              !readOnly && 'cursor-pointer hover:bg-muted/40',
            )}
          >
            <div
              className="absolute -top-2.5 -left-2.5 z-10 inline-flex items-center gap-0.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white ring-2 ring-background"
              title={`${n} skill${n === 1 ? '' : 's'}`}
            >
              <Sparkles className="h-2.5 w-2.5" />{n}
            </div>
            {n > 1 && (
              <button type="button" title="Previous skill" disabled={pos === 0}
                onClick={(e) => { e.stopPropagation(); setIdx((p) => Math.max(0, p - 1)); }}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="min-w-0 flex-1 truncate px-0.5 text-sm font-medium">{cur!.name}</span>
            {!readOnly && (
              <button type="button" title="Remove from step"
                onClick={(e) => { e.stopPropagation(); onChange(selectedIds.filter((x) => x !== cur!.id)); setIdx((p) => Math.max(0, Math.min(p, n - 2))); }}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {n > 1 && (
              <button type="button" title="Next skill" disabled={pos === n - 1}
                onClick={(e) => { e.stopPropagation(); setIdx((p) => Math.min(n - 1, p + 1)); }}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {plus}
        </div>
        {sheetNode}
      </>
    );
  }

  // ── Inline (inside the AI-step form): wrapped bordered chips + inline add. ──
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => !readOnly && setSheet({ focusId: s.id })}
            title={s.description || s.name}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs transition-colors',
              readOnly ? 'cursor-default' : 'hover:bg-muted',
            )}
          >
            <Sparkles className="h-3 w-3 shrink-0 text-brand" />
            <span className="max-w-[140px] truncate">{s.name}</span>
          </button>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => setSheet({ add: true })}
            title="Add a skill"
            className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <Plus className="h-3 w-3" />{selected.length === 0 ? 'Add skill' : ''}
          </button>
        )}
      </div>
      {sheetNode}
    </>
  );
}

// ── Skill manager: edit any assigned skill, add a new/existing one, remove. ──
function SkillManagerSheet({
  orgId, skills, selectedIds, focusId, startAdd, onClose, onChange, onSkillsChanged,
}: {
  orgId: string;
  skills: Skill[];
  selectedIds: string[];
  focusId?: string;
  startAdd?: boolean;
  onClose: () => void;
  onChange: (ids: string[]) => void;
  onSkillsChanged?: () => void;
}) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean) as Skill[];
  const skillToForm = (s?: Skill): SkillFormData => (s ? { name: s.name, description: s.description ?? '', content: s.content ?? '' } : BLANK);

  const [sel, setSel] = useState<string | 'add'>(startAdd ? 'add' : (focusId ?? selected[0]?.id ?? 'add'));
  const [form, setForm] = useState<SkillFormData>(skillToForm(sel !== 'add' ? byId.get(sel) : undefined));
  const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
  const [existingPick, setExistingPick] = useState('');
  const [saving, setSaving] = useState(false);

  const editing = sel !== 'add' ? byId.get(sel) : undefined;
  const valid = !!(form.name.trim() && form.content.trim());
  const available = skills.filter((s) => !selectedIds.includes(s.id));

  const pick = (id: string) => { setSel(id); setForm(skillToForm(byId.get(id))); };
  const openAdd = () => { setSel('add'); setAddMode('new'); setExistingPick(''); setForm(BLANK); };

  const saveEdit = async () => {
    if (!editing || !valid) return;
    setSaving(true);
    try {
      await updateSkill(orgId, editing.id, { name: form.name.trim(), description: form.description.trim() || undefined, content: form.content });
      onSkillsChanged?.();
      toast.success('Skill updated');
      onClose();
    } catch (e: any) { toast.error(e?.response?.data?.error || e?.message || 'Failed to update skill'); }
    finally { setSaving(false); }
  };
  const saveNew = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const created = await createSkill(orgId, { name: form.name.trim(), description: form.description.trim() || undefined, content: form.content });
      onChange([...selectedIds, created.id]);
      onSkillsChanged?.();
      toast.success(`Created "${created.name}"`);
      onClose();
    } catch (e: any) { toast.error(e?.response?.data?.error || e?.message || 'Failed to create skill'); }
    finally { setSaving(false); }
  };
  const remove = (id: string) => {
    const rest = selectedIds.filter((x) => x !== id);
    onChange(rest);
    if (rest[0]) pick(rest[0]); else openAdd();
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-4 py-4 sm:px-6"><SheetTitle>Skills</SheetTitle></SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
          {/* Assigned-skill selector + add */}
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.map((s) => (
              <button key={s.id} type="button" onClick={() => pick(s.id)}
                className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
                  sel === s.id ? 'border-brand bg-brand/5 text-brand' : 'hover:bg-muted')}>
                <Sparkles className="h-3 w-3" /><span className="max-w-[140px] truncate">{s.name}</span>
              </button>
            ))}
            <button type="button" onClick={openAdd} title="Add a skill"
              className={cn('inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs transition-colors',
                sel === 'add' ? 'border-brand text-brand' : 'text-muted-foreground hover:text-foreground')}>
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>

          <div className="border-t pt-4">
            {sel === 'add' ? (
              <div className="space-y-3">
                <div className="flex w-fit items-center gap-1 rounded-md bg-muted p-1 text-sm">
                  <button type="button" onClick={() => setAddMode('new')} className={cn('rounded px-3 py-1', addMode === 'new' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}>New skill</button>
                  <button type="button" onClick={() => setAddMode('existing')} className={cn('rounded px-3 py-1', addMode === 'existing' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}>Use existing</button>
                </div>
                {addMode === 'existing' ? (
                  <div className="space-y-1">
                    <Label>Skill</Label>
                    <Select value={existingPick} onValueChange={setExistingPick}>
                      <SelectTrigger><SelectValue placeholder="Select a skill to add…" /></SelectTrigger>
                      <SelectContent>
                        {available.length === 0
                          ? <SelectItem value="_none" disabled>No other skills available</SelectItem>
                          : available.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <SkillFormBody form={form} setForm={setForm} />
                )}
              </div>
            ) : editing ? (
              <SkillFormBody form={form} setForm={setForm} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a skill above, or add one.</p>
            )}
          </div>
        </div>

        <SheetFooter className="border-t px-4 py-4 sm:px-6 flex items-center">
          {editing && (
            <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => remove(editing.id)} disabled={saving}>
              <Trash2 className="mr-1 h-4 w-4" /> Remove from step
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
          {sel === 'add'
            ? (addMode === 'existing'
              ? <Button onClick={() => { if (existingPick) { onChange([...selectedIds, existingPick]); onClose(); } }} disabled={!existingPick}>Add</Button>
              : <Button onClick={saveNew} disabled={saving || !valid}>{saving ? 'Saving…' : 'Create & add'}</Button>)
            : editing
              ? <Button onClick={saveEdit} disabled={saving || !valid}>{saving ? 'Saving…' : 'Save'}</Button>
              : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
