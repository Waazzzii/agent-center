'use client';

import { TokenHealthStatus as HealthStatus } from '@/types/api.types';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, HelpCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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

  // Don't show anything if no health status
  if (!healthStatus || healthStatus === 'unknown') {
    return null;
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const calculateDaysUntil = (dateStr: string) => {
    const target = new Date(dateStr);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const calculateDaysSince = (dateStr: string) => {
    const past = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - past.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  // Healthy status
  if (healthStatus === 'healthy') {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-900">Token is healthy</AlertTitle>
        <AlertDescription className="text-green-800">
          {lastRenewedAt && (
            <p className="mb-1">Last refreshed: {formatDateTime(lastRenewedAt)}</p>
          )}
          {expiresAt && (
            <p>Expires: {formatDate(expiresAt)}</p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Needs renewal status
  if (healthStatus === 'needs_renewal') {
    const daysUntil = expiresAt ? calculateDaysUntil(expiresAt) : 0;
    return (
      <Alert className="border-orange-200 bg-orange-50">
        <Clock className="h-4 w-4 text-orange-600" />
        <AlertTitle className="text-orange-900">Token expiring soon</AlertTitle>
        <AlertDescription className="text-orange-800">
          {expiresAt && (
            <>
              <p className="mb-1">
                Will expire: {formatDate(expiresAt)} (in {daysUntil} day{daysUntil !== 1 ? 's' : ''})
              </p>
              <p className="text-sm">Automatic renewal scheduled</p>
            </>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Renewal failed status
  if (healthStatus === 'renewal_failed') {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertTitle className="text-red-900">Token renewal failed</AlertTitle>
        <AlertDescription className="text-red-800">
          <p className="mb-2">
            Token was renewed by the provider but failed to save. Immediate action required.
          </p>
          <p className="font-semibold">
            Action: Contact connector support to request a new token renewal.
          </p>
          <p className="mt-2 text-xs text-red-600">
            Check audit logs for error details.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // Expired status
  if (healthStatus === 'expired') {
    const daysAgo = expiresAt ? calculateDaysSince(expiresAt) : 0;
    return (
      <Alert className="border-red-200 bg-red-50">
        <XCircle className="h-4 w-4 text-red-600" />
        <AlertTitle className="text-red-900">Token expired</AlertTitle>
        <AlertDescription className="text-red-800">
          <p className="mb-2">
            This connector will not work until the token is renewed.
          </p>
          {expiresAt && (
            <p className="text-sm">
              Expired: {formatDate(expiresAt)} ({daysAgo} day{daysAgo !== 1 ? 's' : ''} ago)
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Unknown status (shouldn't reach here, but just in case)
  return (
    <Alert className="border-gray-200 bg-gray-50">
      <HelpCircle className="h-4 w-4 text-gray-600" />
      <AlertTitle className="text-gray-900">Token status unknown</AlertTitle>
      <AlertDescription className="text-gray-800">
        No expiration tracking available for this connector.
      </AlertDescription>
    </Alert>
  );
}
