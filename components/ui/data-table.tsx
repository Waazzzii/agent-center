'use client';

/**
 * DataTable — THE standard list surface. One component so every list page shares
 * the same shell, not just the same inner table:
 *   • toolbar ABOVE the table (search left, count + right-slot controls right)
 *   • the table in ONE consistent container (Card, bg-card, rounded border)
 *   • optional pagination below
 * Everything else (columns, sort, inline filters, row click, checkboxes) is
 * ResponsiveTable, passed straight through. Change the shell here → every list
 * updates together.
 */

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { ResponsiveTable, type ResponsiveTableProps } from '@/components/ui/responsive-table';
import { TablePagination } from '@/components/ui/table-pagination';

export interface DataTableProps<T> extends ResponsiveTableProps<T> {
  /** Standard search box, rendered above the table on the left. */
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  /** Muted text beside the search (e.g. "12 of 40"). */
  count?: React.ReactNode;
  /** Controls pushed to the toolbar's right edge (a "New …" button, a toggle). */
  toolbarRight?: React.ReactNode;
  /** When set, renders the shared pager below the table. */
  pagination?: { page: number; totalPages: number; onPageChange: (page: number) => void; total?: number };
}

export function DataTable<T>({
  search, count, toolbarRight, pagination, ...table
}: DataTableProps<T>) {
  const hasToolbar = !!(search || count || toolbarRight);
  return (
    <div className="flex flex-col gap-3">
      {hasToolbar && (
        <DataTableToolbar
          search={search}
          right={(count || toolbarRight) ? <>{count}{toolbarRight}</> : undefined}
        />
      )}
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <ResponsiveTable<T> {...table} />
        </CardContent>
      </Card>
      {pagination && <TablePagination {...pagination} />}
    </div>
  );
}
