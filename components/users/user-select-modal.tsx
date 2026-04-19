'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Check } from 'lucide-react';
import { User } from '@/types/api.types';
import { Avatar } from '@/components/ui/avatar';

interface UserSelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  users: User[];
  onSelect: (userId: string) => void;
  excludeUserId?: string; // User to exclude from the list
}

export function UserSelectModal({
  open,
  onOpenChange,
  title,
  description,
  users,
  onSelect,
  excludeUserId,
}: UserSelectModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Reset state when modal opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSearchQuery('');
      setSelectedUserId(null);
    }
    onOpenChange(newOpen);
  };

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return users
      .filter((user) => user.id !== excludeUserId)
      .filter((user) => {
        if (!query) return true;

        const displayName =
          user.display_name ||
          (user.first_name || user.last_name
            ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
            : '');

        return (
          displayName.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const aName = a.display_name || a.email;
        const bName = b.display_name || b.email;
        return aName.localeCompare(bName);
      });
  }, [users, searchQuery, excludeUserId]);

  const handleUserClick = (userId: string) => {
    setSelectedUserId(userId);
    onSelect(userId);
    onOpenChange(false);
  };

  const getUserDisplayName = (user: User) => {
    return (
      user.display_name ||
      (user.first_name || user.last_name
        ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
        : user.email)
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Search */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} available
            </div>
          </div>

          {/* Users List */}
          <div className="flex-1 overflow-y-auto rounded-lg border min-h-[300px]">
            {filteredUsers.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No matching users found' : 'No users available'}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredUsers.map((user) => {
                  const displayName = getUserDisplayName(user);
                  const isSelected = selectedUserId === user.id;

                  return (
                    <div
                      key={user.id}
                      className={`flex items-center gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                        isSelected ? 'bg-muted' : ''
                      }`}
                      onClick={() => handleUserClick(user.id)}
                    >
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        {user.picture_url ? (
                          <img src={user.picture_url} alt={displayName} className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-brand/10 text-brand font-medium">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{displayName}</div>
                        <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                      </div>

                      {isSelected && (
                        <Check className="h-5 w-5 text-brand flex-shrink-0" />
                      )}

                      {!user.is_active && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs font-medium text-gray-800 dark:text-gray-400 flex-shrink-0">
                          Inactive
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
