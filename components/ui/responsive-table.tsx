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
  /**
   * Header content. A ReactNode rather than a string so a column whose meaning
   * is not obvious from two words can carry a help affordance in the header,
   * instead of repeating an explanation on every row.
   *
   * mobileLabel stays a string — the card layout renders it as a plain key next
   * to its value, where interactive content would have nowhere sensible to go.
   */
  label: React.ReactNode;
  render: (item: T) => React.ReactNode;
  desktopRender?: (item: T) => React.ReactNode;
  hideOnMobile?: boolean;
  mobileLabel?: string;
  mobileFullWidth?: boolean;
  sortable?: boolean;
  /** Inline column filter — render a <ColumnFilter> here; it sits beside the label. */
  filter?: React.ReactNode;
  thClassName?: string;
  tdClassName?: string;
}

export interface ResponsiveTableProps<T> {
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
  /**
   * True when a search/filter is narrowing the list. When set and the (already
   * filtered) data is empty, the table + headers stay and the empty message
   * shows inline as a row — so a filter that matches nothing doesn't make the
   * columns vanish. Only a TRULY empty list (no rows before filtering, i.e.
   * isFiltered falsey) shows the big standalone message.
   */
  isFiltered?: boolean;
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
  isFiltered = false,
}: ResponsiveTableProps<T>) {
  const [detailItem, setDetailItem] = React.useState<T | null>(null);

  const handleRowClick = (item: T) => {
    if (detailRender) {
      setDetailItem(item);
    } else {
      onRowClick?.(item);
    }
  };

  const isEmpty = !data || data.length === 0;

  // Truly empty (nothing to filter) → the big standalone message. A filter that
  // matched nothing keeps the table + headers and shows the message inline below.
  if (isEmpty && !isFiltered) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const isClickable = !!(detailRender || onRowClick);
  const colSpan = columns.length + (showCheckboxes ? 1 : 0);

  return (
    <>
      {/* Desktop Table View */}
      <div className={cn('hidden md:block w-full overflow-hidden', className)}>
        <table className="w-full caption-bottom text-sm table-fixed">
          <thead className="[&_tr]:border-b">
            <tr className="border-b transition-colors">
              {showCheckboxes && <th className="w-10 px-3"></th>}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn('text-muted-foreground h-10 px-3 first:pl-4 text-left align-middle text-xs font-medium', column.thClassName)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {column.sortable && onSort ? (
                      <button
                        className="flex items-center gap-1 hover:text-foreground select-none"
                        onClick={() => onSort(column.key)}
                      >
                        {column.label}
                        {sortKey === column.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-brand" /> : <ArrowDown className="h-3.5 w-3.5 text-brand" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                        )}
                      </button>
                    ) : column.label}
                    {column.filter}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {isEmpty && (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {data.map((item) => {
              const itemId = getRowKey(item);
              return (
                <tr
                  key={itemId}
                  onClick={() => handleRowClick(item)}
                  className={cn(
                    'h-11 hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors',
                    isClickable && 'cursor-pointer'
                  )}
                >
                  {showCheckboxes && (
                    <td className="w-10 px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center">
                        <Checkbox
                          checked={selectedIds.includes(itemId)}
                          onCheckedChange={() => onToggleSelect?.(itemId)}
                        />
                      </div>
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn('px-3 first:pl-4 align-middle', !column.desktopRender && 'overflow-hidden', column.tdClassName)}
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
        {isEmpty && (
          <div className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
        )}
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
