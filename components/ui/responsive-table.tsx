'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

interface Column<T> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  desktopRender?: (item: T) => React.ReactNode;
  hideOnMobile?: boolean;
  mobileLabel?: string;
  mobileFullWidth?: boolean;
  sortable?: boolean;
  thClassName?: string;
  tdClassName?: string;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  /** When provided, clicking a row opens a detail dialog instead of calling onRowClick */
  detailRender?: (item: T) => React.ReactNode;
  detailTitle?: (item: T) => string;
  getRowKey?: (item: T) => string;
  emptyMessage?: string;
  className?: string;
  showCheckboxes?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
}

export function ResponsiveTable<T>({
  data,
  columns,
  onRowClick,
  detailRender,
  detailTitle,
  getRowKey = (item: any) => item.id,
  emptyMessage = 'No data available',
  className,
  showCheckboxes = false,
  selectedIds = [],
  onToggleSelect,
  sortKey,
  sortDir,
  onSort,
}: ResponsiveTableProps<T>) {
  const [detailItem, setDetailItem] = React.useState<T | null>(null);

  const handleRowClick = (item: T) => {
    if (detailRender) {
      setDetailItem(item);
    } else {
      onRowClick?.(item);
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const isClickable = !!(detailRender || onRowClick);

  return (
    <>
      {/* Desktop Table View */}
      <div className={cn('hidden md:block w-full overflow-hidden', className)}>
        <table className="w-full caption-bottom text-sm table-fixed">
          <thead className="[&_tr]:border-b">
            <tr className="border-b transition-colors">
              {showCheckboxes && <th className="w-10 px-2"></th>}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn('text-foreground h-10 px-2 first:pl-4 text-left align-middle font-medium', column.thClassName)}
                >
                  {column.sortable && onSort ? (
                    <button
                      className="flex items-center gap-1 hover:text-foreground/80 select-none"
                      onClick={() => onSort(column.key)}
                    >
                      {column.label}
                      {sortKey === column.key ? (
                        sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : column.label}
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
                  onClick={() => handleRowClick(item)}
                  className={cn(
                    'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors',
                    isClickable && 'cursor-pointer'
                  )}
                >
                  {showCheckboxes && (
                    <td className="w-10 p-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.includes(itemId)}
                        onCheckedChange={() => onToggleSelect?.(itemId)}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn('p-2 first:pl-4 align-middle', !column.desktopRender && 'overflow-hidden', column.tdClassName)}
                    >
                      {column.desktopRender ? (
                        column.desktopRender(item)
                      ) : (
                        <div className="truncate">
                          {column.render(item)}
                        </div>
                      )}
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
          const actionsFullWidth = actionsColumn?.mobileFullWidth ?? false;

          return (
            <Card
              key={itemId}
              onClick={() => handleRowClick(item)}
              className={cn(
                'transition-colors',
                isClickable && 'cursor-pointer hover:bg-muted/50'
              )}
            >
              <div className={cn('flex gap-3 p-4', !actionsFullWidth && 'items-stretch')}>
                {showCheckboxes && (
                  <Checkbox
                    checked={selectedIds.includes(itemId)}
                    onCheckedChange={() => onToggleSelect?.(itemId)}
                    onClick={(e) => e.stopPropagation()}
                    className="self-center"
                  />
                )}

                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {dataColumns.map((column) => (
                      <div key={column.key} className="flex-1 min-w-[120px] overflow-hidden">
                        <div className="text-sm font-medium text-muted-foreground">
                          {column.mobileLabel || column.label}
                        </div>
                        <div className="text-sm truncate">{column.render(item)}</div>
                      </div>
                    ))}
                  </div>

                  {actionsFullWidth && actionsColumn && (
                    <div onClick={(e) => e.stopPropagation()}>
                      {actionsColumn.render(item)}
                    </div>
                  )}
                </div>

                {!actionsFullWidth && actionsColumn && (
                  <div className="flex flex-col w-12 -mr-4 -my-4" onClick={(e) => e.stopPropagation()}>
                    {actionsColumn.render(item)}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Detail dialog */}
      {detailRender && (
        <Dialog open={detailItem !== null} onOpenChange={(open) => !open && setDetailItem(null)}>
          <DialogContent className="sm:max-w-2xl md:left-[calc(50%+8rem)] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {detailItem && detailTitle ? detailTitle(detailItem) : 'Details'}
              </DialogTitle>
            </DialogHeader>
            {detailItem && detailRender(detailItem)}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
