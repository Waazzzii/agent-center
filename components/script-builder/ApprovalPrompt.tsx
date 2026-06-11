'use client';

/**
 * Inline approve/deny prompt shown when the builder agent requests approval
 * for an irreversible action (form submit, payment, delete, send).
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PauseCircle } from 'lucide-react';

interface ApprovalPromptProps {
  reason: string;
  action?: string | null;
  onDecide: (approved: boolean) => Promise<void>;
}

export function ApprovalPrompt({ reason, action, onDecide }: ApprovalPromptProps) {
  const [pending, setPending] = useState<'approve' | 'deny' | null>(null);

  const decide = async (approved: boolean) => {
    setPending(approved ? 'approve' : 'deny');
    try {
      await onDecide(approved);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mx-3 mb-2 rounded-md border border-violet-500/40 bg-violet-500/10 p-3 shrink-0">
      <div className="flex items-start gap-2">
        <PauseCircle className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-violet-400">The agent needs your approval</p>
          <p className="mt-1 text-xs text-foreground whitespace-pre-wrap">{reason}</p>
          {action && (
            <p className="mt-1 text-[11px] text-muted-foreground whitespace-pre-wrap">{action}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={() => decide(false)}
        >
          {pending === 'deny' ? 'Denying…' : 'Deny'}
        </Button>
        <Button
          size="sm"
          disabled={pending !== null}
          onClick={() => decide(true)}
        >
          {pending === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
