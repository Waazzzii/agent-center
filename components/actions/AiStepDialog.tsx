'use client';

import { useState, useEffect } from 'react';
import { type AiStep } from '@/lib/api/ai-steps';
import { type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AiStepFormBody, type AiStepFormData, type ConnectorOption } from './AiStepFormBody';
import { InfoBlock } from './InfoBlock';
import Link from 'next/link';

export type { AiStepFormData, ConnectorOption } from './AiStepFormBody';

interface AiStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step?: AiStep | null;
  connectors: ConnectorOption[];
  skills: Skill[];
  readOnly?: boolean;
  saving?: boolean;
  onSave?: (data: AiStepFormData) => Promise<void>;
}

export function AiStepDialog({
  open,
  onOpenChange,
  step,
  connectors,
  skills,
  readOnly = false,
  saving = false,
  onSave,
}: AiStepDialogProps) {
  const [form, setForm] = useState<AiStepFormData>({
    name: '',
    description: '',
    prompt: '',
    model: 'claude-sonnet-4-6',
    connector_ids: [],
    outputs: [],
    skill_ids: [],
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: step?.name ?? '',
        description: step?.description ?? '',
        prompt: step?.prompt ?? '',
        model: step?.model ?? 'claude-sonnet-4-6',
        connector_ids: step?.connector_ids ?? [],
        outputs: step?.outputs ?? [],
        skill_ids: step?.skill_ids ?? [],
      });
    }
  }, [open, step]);

  const title = readOnly ? (step?.name ?? 'AI Step') : step ? 'Edit AI Step' : 'New AI Step';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {readOnly && (
          <InfoBlock>
            This is read-only.  To make changes,{' '}
            <Link href="/actions/ai-steps" className="text-primary hover:underline font-medium">edit it in AI Steps →</Link>
          </InfoBlock>
        )}

        <AiStepFormBody
          form={form}
          setForm={setForm}
          connectors={connectors}
          skills={skills}
          readOnly={readOnly}
        />

        <DialogFooter>
          {readOnly ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => onSave?.(form)}
                disabled={saving || !form.name.trim() || !form.prompt.trim()}
              >
                {saving ? 'Saving…' : step ? 'Save' : 'Create'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
