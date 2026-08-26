'use client';

/**
 * TagAssignDialog — centralized "assign tags" modal, reused from every row's
 * ⋮ menu (agents, AI steps, browser scripts). Wraps the same TagPicker bar the
 * Tags screen uses: search existing tags, and when the search matches nothing,
 * an inline "Create …" option creates the tag on the spot.
 *
 * Entity-agnostic: the caller supplies the current tag ids and an onSave that
 * persists them (updateAgent / updateAiStep / updateScript) and refreshes the
 * list.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTags } from '@/lib/hooks/use-tags';
import { TagPicker } from './tag-picker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  /** Shown in the title to clarify which row is being tagged. */
  entityLabel?: string;
  /** Current tag ids on the entity — re-seeds the picker each time it opens. */
  initialTagIds: string[];
  /** Persist the new tag set (update the entity + refresh the caller's list). */
  onSave: (tagIds: string[]) => Promise<void>;
}

export function TagAssignDialog({ open, onOpenChange, orgId, entityLabel, initialTagIds, onSave }: Props) {
  const { tags, createTag } = useTags(orgId);
  const [selected, setSelected] = useState<string[]>(initialTagIds);
  const [saving, setSaving] = useState(false);

  // Re-seed from the row's current tags whenever the dialog (re)opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setSelected(initialTagIds); }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(selected);
      onOpenChange(false);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Failed to update tags');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      {/* overflow-visible is load-bearing, not cosmetic.
          DialogContent ships with overflow-y-auto, which makes it a scroll
          container — and a scroll container CLIPS the picker's absolutely
          positioned suggestion list. The result was a dialog whose whole point
          (choosing from a list) was cut off at the box edge, with the list
          technically scrollable inside a container nobody could see.

          Wider and taller for the same reason: the list needs somewhere to open
          INTO. min-h reserves that space so the suggestions sit inside the
          dialog rather than hanging off the bottom of it. */}
      <DialogContent className="sm:max-w-xl overflow-visible">
        <DialogHeader>
          <DialogTitle>Tags{entityLabel ? ` · ${entityLabel}` : ''}</DialogTitle>
          <DialogDescription>
            Type to search, or type a new name and press Enter to create one.
          </DialogDescription>
        </DialogHeader>
        <div className="py-1 min-h-[18rem]">
          <TagPicker
            tags={tags}
            selected={selected}
            onChange={setSelected}
            onCreate={(name) => createTag({ name })}
            placeholder="Search or create a tag…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
