'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

interface Column<T> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  desktopRender?: (item: T) => React.ReactNode; // Optional separate render for desktop
  hideOnMobile?: boolean;
  mobileLabel?: string; // Custom label for mobile card view
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  getRowKey: (item: T) => string;
  emptyMessage?: string;
  className?: string;
  showCheckboxes?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

export function ResponsiveTable<T>({
  data,
  columns,
  onRowClick,
  getRowKey,
  emptyMessage = 'No data available',
  className,
  showCheckboxes = false,
  selectedIds = [],
  onToggleSelect,
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className={cn('hidden md:block relative w-full overflow-x-auto', className)}>
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            <tr className="border-b transition-colors">
              {showCheckboxes && <th className="w-12"></th>}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {data.map((item) => {
              const itemId = getRowKey(item);
              return (
                <tr
                  key={itemId}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {showCheckboxes && (
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.includes(itemId)}
                        onCheckedChange={() => onToggleSelect?.(itemId)}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className="p-2 align-middle whitespace-nowrap"
                    >
                      {column.desktopRender ? column.desktopRender(item) : column.render(item)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {data.map((item) => {
          const itemId = getRowKey(item);
          const visibleColumns = columns.filter((column) => !column.hideOnMobile);
          const actionsColumn = visibleColumns.find((col) => col.key === 'actions');
          const dataColumns = visibleColumns.filter((col) => col.key !== 'actions');

          return (
            <Card
              key={itemId}
              onClick={() => onRowClick?.(item)}
              className={cn(
                'p-4 transition-colors',
                onRowClick && 'cursor-pointer hover:bg-muted/50'
              )}
            >
              <div className="flex items-stretch gap-3">
                {/* Optional checkbox */}
                {showCheckboxes && (
                  <Checkbox
                    checked={selectedIds.includes(itemId)}
                    onCheckedChange={() => onToggleSelect?.(itemId)}
                    onClick={(e) => e.stopPropagation()}
                    className="self-center"
                  />
                )}

                {/* Main content area */}
                <div className="flex-1 min-w-0 space-y-3 py-1 pr-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {dataColumns.map((column) => (
                      <div key={column.key} className="flex-1 min-w-[120px]">
                        <div className="text-sm font-medium text-muted-foreground">
                          {column.mobileLabel || column.label}
                        </div>
                        <div className="text-sm">{column.render(item)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions column on the right */}
                {actionsColumn && (
                  <div className="flex flex-col w-12 -mr-4 -my-4" onClick={(e) => e.stopPropagation()}>
                    {actionsColumn.render(item)}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
