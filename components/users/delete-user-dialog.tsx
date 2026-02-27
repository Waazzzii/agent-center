'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, UserCircle } from 'lucide-react';
import { User } from '@/types/api.types';
import { UserSelectModal } from './user-select-modal';

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userToDelete: User | null;
  availableUsers: User[];
  onConfirm: (reassignToUserId: string) => Promise<void>;
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  userToDelete,
  availableUsers,
  onConfirm,
}: DeleteUserDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUserSelect, setShowUserSelect] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedUserId('');
      setSelectedUser(null);
      setError(null);
      setIsDeleting(false);
    }
  }, [open]);

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    const user = availableUsers.find((u) => u.id === userId);
    setSelectedUser(user || null);
    setError(null);
  };

  const handleConfirm = async () => {
    if (!selectedUserId) {
      setError('Please select a user to reassign content to');
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await onConfirm(selectedUserId);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
      setIsDeleting(false);
    }
  };

  if (!userToDelete) return null;

  const displayName =
    userToDelete.display_name ||
    (userToDelete.first_name || userToDelete.last_name
      ? `${userToDelete.first_name || ''} ${userToDelete.last_name || ''}`.trim()
      : userToDelete.email);

  const selectedUserDisplayName = selectedUser
    ? selectedUser.display_name ||
      (selectedUser.first_name || selectedUser.last_name
        ? `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim()
        : selectedUser.email)
    : null;

  const hasOtherUsers = availableUsers.filter((u) => u.id !== userToDelete.id).length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              You are about to delete <strong>{displayName}</strong>. Their content will be
              reassigned to another user.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This action cannot be undone. All KB articles, media, and other content created by
                this user will be reassigned to the selected user.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium block mb-3">Reassign content to:</label>

              {!hasOtherUsers ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No other users available in this organization. You must have at least one other
                    user to delete this user.
                  </AlertDescription>
                </Alert>
              ) : selectedUser ? (
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                  <div className="flex items-center gap-3">
                    <UserCircle className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{selectedUserDisplayName}</div>
                      <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUserSelect(true)}
                    disabled={isDeleting}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-6 px-4"
                  onClick={() => setShowUserSelect(true)}
                  disabled={isDeleting}
                >
                  <UserCircle className="mr-3 h-10 w-10 flex-shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">Select a user...</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Choose who will inherit this user's content
                    </div>
                  </div>
                </Button>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!selectedUserId || isDeleting || !hasOtherUsers}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? 'Deleting...' : 'Delete User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserSelectModal
        open={showUserSelect}
        onOpenChange={setShowUserSelect}
        title="Select User to Reassign Content"
        description="Choose which user will inherit all content created by the user being deleted."
        users={availableUsers}
        onSelect={handleUserSelect}
        excludeUserId={userToDelete.id}
      />
    </>
  );
}
