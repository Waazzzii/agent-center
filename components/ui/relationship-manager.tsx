'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, CheckSquare, Square, MinusSquare, Plus, Trash2 } from 'lucide-react';

export interface RelationshipItem {
  id: string;
  primaryLabel: string;
  secondaryLabel?: string;
  status?: {
    label: string;
    variant: 'active' | 'inactive';
  };
}

interface RelationshipManagerProps {
  title: string;
  description: string;
  currentItems: RelationshipItem[];
  availableItems: RelationshipItem[];
  onAdd: (ids: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  searchPlaceholder?: string;
  emptyCurrentMessage?: string;
  emptyAvailableMessage?: string;
  addButtonLabel?: string;
}

export function RelationshipManager({
  title,
  description,
  currentItems,
  availableItems,
  onAdd,
  onRemove,
  searchPlaceholder = 'Search...',
  emptyCurrentMessage = 'No items assigned yet',
  emptyAvailableMessage = 'No items available to add',
  addButtonLabel = 'Add Selected',
}: RelationshipManagerProps) {
  const [currentSearch, setCurrentSearch] = useState('');
  const [availableSearch, setAvailableSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  // Filter current items
  const filteredCurrent = useMemo(() => {
    if (!currentSearch.trim()) return currentItems;
    const query = currentSearch.toLowerCase();
    return currentItems.filter(
      (item) =>
        item.primaryLabel.toLowerCase().includes(query) ||
        item.secondaryLabel?.toLowerCase().includes(query)
    );
  }, [currentItems, currentSearch]);

  // Filter available items (exclude already assigned ones)
  const filteredAvailable = useMemo(() => {
    const currentIds = new Set(currentItems.map((item) => item.id));
    const available = availableItems.filter((item) => !currentIds.has(item.id));

    if (!availableSearch.trim()) return available;
    const query = availableSearch.toLowerCase();
    return available.filter(
      (item) =>
        item.primaryLabel.toLowerCase().includes(query) ||
        item.secondaryLabel?.toLowerCase().includes(query)
    );
  }, [availableItems, currentItems, availableSearch]);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  // Calculate selection state for filtered available items
  const selectionState = useMemo(() => {
    if (filteredAvailable.length === 0) return 'none';
    const selectedCount = filteredAvailable.filter((item) => selectedIds.includes(item.id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === filteredAvailable.length) return 'all';
    return 'some';
  }, [filteredAvailable, selectedIds]);

  const toggleSelectAll = () => {
    if (selectionState === 'all') {
      // Deselect all filtered items
      const filteredIds = filteredAvailable.map((item) => item.id);
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      // Select all filtered items
      const filteredIds = filteredAvailable.map((item) => item.id);
      setSelectedIds((prev) => {
        const newSet = new Set([...prev, ...filteredIds]);
        return Array.from(newSet);
      });
    }
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0) return;
    try {
      setAdding(true);
      await onAdd(selectedIds);
      setSelectedIds([]);
      setAvailableSearch('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Items */}
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search current */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={currentSearch}
              onChange={(e) => setCurrentSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Current items table */}
          {filteredCurrent.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {currentSearch ? 'No matching items found' : emptyCurrentMessage}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  {filteredCurrent.some((item) => item.status) && <TableHead>Status</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCurrent.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.primaryLabel}</div>
                        {item.secondaryLabel && (
                          <div className="text-sm text-muted-foreground">{item.secondaryLabel}</div>
                        )}
                      </div>
                    </TableCell>
                    {item.status && (
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            item.status.variant === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.status.label}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onRemove(item.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add New Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Items
          </CardTitle>
          <CardDescription>Select items to add to this list</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search available */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={`${searchPlaceholder} (${selectedIds.length} selected)`}
                value={availableSearch}
                onChange={(e) => setAvailableSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleSelectAll}
              disabled={filteredAvailable.length === 0}
              title={
                selectionState === 'all'
                  ? 'Deselect all'
                  : selectionState === 'some'
                  ? 'Select all'
                  : 'Select all'
              }
            >
              {selectionState === 'all' ? (
                <CheckSquare className="h-4 w-4" />
              ) : selectionState === 'some' ? (
                <MinusSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Available items checkboxes */}
          <div className="rounded-lg border p-4 max-h-96 overflow-y-auto">
            {filteredAvailable.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {availableSearch ? 'No matching items found' : emptyAvailableMessage}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAvailable.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleToggle(item.id)}
                  >
                    <Checkbox
                      id={`add-${item.id}`}
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => handleToggle(item.id)}
                      className="pointer-events-none"
                    />
                    <label htmlFor={`add-${item.id}`} className="flex-1 cursor-pointer select-none">
                      <div className="text-sm font-medium">{item.primaryLabel}</div>
                      {item.secondaryLabel && (
                        <div className="text-sm text-muted-foreground">{item.secondaryLabel}</div>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add button */}
          <Button onClick={handleAdd} disabled={selectedIds.length === 0 || adding} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {adding ? 'Adding...' : `${addButtonLabel} (${selectedIds.length})`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
