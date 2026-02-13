'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createUser } from '@/lib/api/users';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { CreateUserDto } from '@/types/api.types';

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

export function CreateUserModal({ open, onOpenChange, organizationId }: CreateUserModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateUserDto>({
    email: '',
    first_name: '',
    last_name: '',
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setFormData({
        email: '',
        first_name: '',
        last_name: '',
      });
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email) {
      toast.error('Email is required');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      const user = await createUser(organizationId, formData);
      toast.success('User created successfully');
      onOpenChange(false);
      // Navigate to the edit page for further configuration
      router.push(`/users/${user.id}/edit`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Create a user with basic information. You can add more details after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@example.com"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              type="text"
              value={formData.first_name || ''}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              placeholder="John"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              type="text"
              value={formData.last_name || ''}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              placeholder="Doe"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
