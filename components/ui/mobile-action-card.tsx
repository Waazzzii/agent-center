'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface MobileActionCardProps {
  /** Content to render in the card body */
  children: React.ReactNode;
  /** Optional checkbox props */
  checkbox?: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    onClick?: (e: React.MouseEvent) => void;
  };
  /** Actions to render on the right side */
  actions?: React.ReactNode;
  /** Click handler for the card */
  onClick?: () => void;
  /** Additional className for the card */
  className?: string;
}

/**
 * Reusable mobile card component with consistent layout:
 * - Optional checkbox on the left
 * - Content area with 2-column grid layout
 * - Actions column on the right (full height)
 */
export function MobileActionCard({
  children,
  checkbox,
  actions,
  onClick,
  className,
}: MobileActionCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        'overflow-hidden transition-colors',
        onClick && 'cursor-pointer active:bg-muted/50',
        className
      )}
    >
      <div className="flex items-stretch">
        {/* Optional checkbox */}
        {checkbox && (
          <Checkbox
            checked={checkbox.checked}
            onCheckedChange={checkbox.onCheckedChange}
            onClick={checkbox.onClick}
            className="self-center ml-4"
          />
        )}

        {/* Content area - children should use grid layout */}
        <div className="flex-1 min-w-0 p-4">
          {children}
        </div>

        {/* Actions column on the right */}
        {actions && (
          <div className="flex flex-col w-12" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Helper component for the content grid layout
 */
export function MobileActionCardContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {children}
    </div>
  );
}

/**
 * Helper component for individual fields
 */
export function MobileActionCardField({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
