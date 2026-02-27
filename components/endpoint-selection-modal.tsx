'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Search, CheckSquare, Square, MinusSquare } from 'lucide-react';

interface EndpointSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableEndpoints: string[];
  initialSelected?: string[];
  onConfirm: (selectedEndpoints: string[]) => void;
  title?: string;
  description?: string;
}

export function EndpointSelectionModal({
  open,
  onOpenChange,
  availableEndpoints,
  initialSelected = [],
  onConfirm,
  title = 'Configure Endpoint Access',
  description = 'Select which endpoints to authorize. At least one endpoint must be selected.',
}: EndpointSelectionModalProps) {
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(
    new Set(initialSelected)
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Update selected endpoints when modal opens or initialSelected changes
  useEffect(() => {
    if (open) {
      setSelectedEndpoints(new Set(initialSelected));
      setSearchQuery('');
    }
  }, [open, initialSelected]);

  // Filter endpoints based on search
  const filteredEndpoints = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableEndpoints;
    }
    const query = searchQuery.toLowerCase();
    return availableEndpoints.filter((endpoint) =>
      endpoint.toLowerCase().includes(query)
    );
  }, [availableEndpoints, searchQuery]);

  // Calculate selection state
  const selectionState = useMemo(() => {
    if (filteredEndpoints.length === 0) return 'none';
    const selectedCount = filteredEndpoints.filter(ep => selectedEndpoints.has(ep)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === filteredEndpoints.length) return 'all';
    return 'some';
  }, [filteredEndpoints, selectedEndpoints]);

  const toggleEndpoint = (endpoint: string) => {
    setSelectedEndpoints((prev) => {
      const next = new Set(prev);
      if (next.has(endpoint)) {
        next.delete(endpoint);
      } else {
        next.add(endpoint);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectionState === 'all') {
      // Deselect all filtered endpoints
      setSelectedEndpoints(prev => {
        const next = new Set(prev);
        filteredEndpoints.forEach(ep => next.delete(ep));
        return next;
      });
    } else {
      // Select all filtered endpoints
      setSelectedEndpoints(prev => {
        const next = new Set(prev);
        filteredEndpoints.forEach(ep => next.add(ep));
        return next;
      });
    }
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedEndpoints));
    onOpenChange(false);
  };

  const handleCancel = () => {
    // State will be reset by useEffect when modal closes/reopens
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Search and actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search endpoints..."
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
              disabled={filteredEndpoints.length === 0}
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

          {/* Stats */}
          <div className="text-sm text-muted-foreground">
            {selectedEndpoints.size} of {availableEndpoints.length} endpoint
            {availableEndpoints.length !== 1 ? 's' : ''} selected
            {searchQuery && filteredEndpoints.length !== availableEndpoints.length && (
              <span> • {filteredEndpoints.length} shown</span>
            )}
          </div>

          {/* Endpoint list */}
          <div className="flex-1 overflow-y-auto border rounded-lg">
            {filteredEndpoints.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {searchQuery ? 'No endpoints match your search' : 'No endpoints available'}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredEndpoints.map((endpoint) => (
                  <div
                    key={endpoint}
                    className="flex items-center space-x-3 p-3 rounded-md hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleEndpoint(endpoint)}
                  >
                    <Checkbox
                      checked={selectedEndpoints.has(endpoint)}
                      onCheckedChange={() => toggleEndpoint(endpoint)}
                      className="pointer-events-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                          {endpoint}
                        </code>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={selectedEndpoints.size === 0}
          >
            Confirm ({selectedEndpoints.size} endpoint{selectedEndpoints.size !== 1 ? 's' : ''})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
