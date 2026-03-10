'use client';

import { ShieldOff } from 'lucide-react';

export function NoPermissionContent() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <ShieldOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="mb-2 text-2xl font-bold">Access Denied</h1>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        You don&apos;t have permission to view this resource. Contact your administrator if you
        believe this is a mistake.
      </p>
    </div>
  );
}
