'use client';

import { useState, useEffect } from 'react';
import { type AiStep } from '@/lib/api/ai-steps';
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
  readOnly?: boolean;
  saving?: boolean;
  onSave?: (data: AiStepFormData) => Promise<void>;
  orgId?: string | null;
}

export function AiStepDialog({
  open,
  onOpenChange,
  step,
  connectors,
  readOnly = false,
  saving = false,
  onSave,
  orgId,
}: AiStepDialogProps) {

  const [form, setForm] = useState<AiStepFormData>({
    name: '',
    description: '',
    prompt: '',
    // Blank on purpose — AiStepFormBody fills it from the catalog.
    model: '',
    connector_ids: [],
    outputs: [],
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: step?.name ?? '',
        description: step?.description ?? '',
        prompt: step?.prompt ?? '',
        model: step?.model ?? '',
        connector_ids: step?.connector_ids ?? [],
        outputs: step?.outputs ?? [],
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
            <Link href="/actions/ai-steps" className="text-brand hover:underline font-medium">edit it in AI Steps →</Link>
          </InfoBlock>
        )}

        <AiStepFormBody
          form={form}
          setForm={setForm}
          connectors={connectors}
          readOnly={readOnly}
          orgId={orgId}
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
