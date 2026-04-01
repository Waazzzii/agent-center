'use client';

import { TokenHealthStatus as HealthStatus } from '@/types/api.types';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';

interface TokenHealthStatusProps {
  healthStatus?: HealthStatus;
  expiresAt?: string;
  lastRenewedAt?: string;
}

export function TokenHealthStatusDisplay({
  healthStatus,
  expiresAt,
  lastRenewedAt,
}: TokenHealthStatusProps) {
  if (!healthStatus || healthStatus === 'unknown') return null;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const daysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const daysAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  if (healthStatus === 'healthy') {
    const parts: string[] = [];
    if (expiresAt) parts.push(`expires ${formatDate(expiresAt)}`);
    if (lastRenewedAt) {
      const n = daysAgo(lastRenewedAt);
      parts.push(`refreshed ${n === 0 ? 'today' : `${n} day${n !== 1 ? 's' : ''} ago`}`);
    }
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 px-3 py-2 text-sm text-green-800 dark:text-green-200">
        <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
        <span>Token valid{parts.length > 0 ? ` · ${parts.join(' · ')}` : ''}</span>
      </div>
    );
  }

  if (healthStatus === 'needs_renewal') {
    const days = expiresAt ? daysUntil(expiresAt) : 0;
    return (
      <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950 px-3 py-2 text-sm text-orange-800 dark:text-orange-200">
        <Clock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
        <span>Token expiring in {days} day{days !== 1 ? 's' : ''}{expiresAt ? ` (${formatDate(expiresAt)})` : ''} · renewal scheduled</span>
      </div>
    );
  }

  if (healthStatus === 'renewal_failed') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-3 py-2 text-sm text-red-800 dark:text-red-200">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
        <span>Token renewal failed · check audit logs</span>
      </div>
    );
  }

  if (healthStatus === 'expired') {
    const n = expiresAt ? daysAgo(expiresAt) : 0;
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-3 py-2 text-sm text-red-800 dark:text-red-200">
        <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
        <span>Token expired {n > 0 ? `${n} day${n !== 1 ? 's' : ''} ago` : ''}{expiresAt ? ` (${formatDate(expiresAt)})` : ''} · renewal required</span>
      </div>
    );
  }

  return null;
}
