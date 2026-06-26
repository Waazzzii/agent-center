'use client';

/**
 * RowActionsMenu — a compact "⋮" (configure) dropdown for table rows.
 * Collapses per-row actions (edit / duplicate / delete / tag …) behind a
 * single trigger so list rows stay clean. Stops click propagation so opening
 * the menu doesn't fire the row's onClick (navigation).
 */

import { MoreVertical } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function RowActionsMenu({ actions, title = 'Configure' }: { actions: RowAction[]; title?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={title}
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {actions.map((a, i) => (
          <DropdownMenuItem
            key={i}
            disabled={a.disabled}
            onSelect={() => a.onSelect()}
            className={cn('gap-2', a.destructive && 'text-destructive focus:text-destructive')}
          >
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
