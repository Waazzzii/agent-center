'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Search, CheckSquare, Square, MinusSquare } from 'lucide-react';

export interface SelectableItem {
  id: string;
  primaryLabel: string;
  secondaryLabel?: string;
  disabled?: boolean;
}

interface MultiSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: SelectableItem[];
  selectedIds: string[];
  onConfirm: (selectedIds: string[]) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
}

export function MultiSelectModal({
  open,
  onOpenChange,
  title,
  description,
  items,
  selectedIds,
  onConfirm,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items available',
  loading = false,
}: MultiSelectModalProps) {
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedIds);
  const [searchQuery, setSearchQuery] = useState('');

  // Reset local state when modal opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setLocalSelectedIds(selectedIds);
      setSearchQuery('');
    }
    onOpenChange(newOpen);
  };

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;

    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.primaryLabel.toLowerCase().includes(query) ||
        item.secondaryLabel?.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  const handleToggle = (id: string) => {
    setLocalSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  // Calculate selection state for filtered items
  const selectionState = useMemo(() => {
    const availableItems = filteredItems.filter((item) => !item.disabled);
    if (availableItems.length === 0) return 'none';

    const selectedCount = availableItems.filter((item) => localSelectedIds.includes(item.id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === availableItems.length) return 'all';
    return 'some';
  }, [filteredItems, localSelectedIds]);

  const toggleSelectAll = () => {
    const availableItems = filteredItems.filter((item) => !item.disabled);
    const availableIds = availableItems.map((item) => item.id);

    if (selectionState === 'all') {
      // Deselect all filtered items
      setLocalSelectedIds((prev) => prev.filter((id) => !availableIds.includes(id)));
    } else {
      // Select all filtered items
      setLocalSelectedIds((prev) => {
        const newSet = new Set([...prev, ...availableIds]);
        return Array.from(newSet);
      });
    }
  };

  const handleConfirm = () => {
    onConfirm(localSelectedIds);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Search and Select All/None */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={toggleSelectAll}
                disabled={loading || filteredItems.filter((item) => !item.disabled).length === 0}
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

            <div className="text-sm text-muted-foreground">
              {localSelectedIds.length} of {items.length} selected
            </div>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto rounded-lg border p-4 min-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mb-2 inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No matching items found' : emptyMessage}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 ${
                      item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    onClick={() => !item.disabled && handleToggle(item.id)}
                  >
                    <Checkbox
                      id={`item-${item.id}`}
                      checked={localSelectedIds.includes(item.id)}
                      onCheckedChange={() => handleToggle(item.id)}
                      disabled={item.disabled}
                      className="pointer-events-none"
                    />
                    <label
                      htmlFor={`item-${item.id}`}
                      className="flex-1 text-sm font-medium leading-none cursor-pointer select-none"
                    >
                      <div>
                        {item.primaryLabel}
                        {item.secondaryLabel && (
                          <span className="ml-2 text-muted-foreground font-normal">
                            ({item.secondaryLabel})
                          </span>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={loading}>
            Confirm Selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
