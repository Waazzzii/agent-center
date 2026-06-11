'use client';

/**
 * Steering input for an AI Script Builder session. Enter sends,
 * Shift+Enter inserts a newline. Amber affordance when the agent is
 * explicitly waiting on the user.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SendHorizonal } from 'lucide-react';

interface ChatInputProps {
  disabled: boolean;
  awaitingUser: boolean;
  onSend: (text: string) => Promise<void>;
}

export function ChatInput({ disabled, awaitingUser, onSend }: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t p-2 shrink-0">
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          disabled={disabled || sending}
          placeholder={
            disabled
              ? 'Session has ended'
              : awaitingUser
                ? 'The agent is waiting for your guidance…'
                : 'Guide the agent… (e.g. "use the Advanced search tab instead")'
          }
          className={cn(
            'min-h-[44px] max-h-32 resize-none text-sm',
            awaitingUser && !disabled && 'ring-1 ring-amber-500/60 focus-visible:ring-amber-500',
          )}
        />
        <Button
          size="sm"
          className="shrink-0"
          disabled={disabled || sending || !text.trim()}
          onClick={() => void send()}
        >
          <SendHorizonal className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
