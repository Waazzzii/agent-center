'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import {
  getRefreshTokens,
  getRefreshTokenStats,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
  ListRefreshTokensParams,
} from '@/lib/api/refresh-tokens';
import { RefreshToken, RefreshTokenStats } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function RefreshTokensPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { confirm } = useConfirmDialog();
  const [tokens, setTokens] = useState<RefreshToken[]>([]);
  const [stats, setStats] = useState<RefreshTokenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListRefreshTokensParams>({
    status: undefined,
    user_email: undefined,
    client_id: undefined,
  });
  const [clientIdError, setClientIdError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || !isSuperAdmin()) {
      router.push('/users');
      return;
    }

    loadData();
  }, [admin]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate client_id format before making request
      if (filters.client_id && filters.client_id.trim() !== '' && !isValidUUID(filters.client_id.trim())) {
        toast.error('Client ID must be a valid UUID format');
        setLoading(false);
        return;
      }

      // Clean up filters - remove empty/undefined values
      const cleanFilters: ListRefreshTokensParams = {};
      if (filters.status) cleanFilters.status = filters.status;
      if (filters.user_email && filters.user_email.trim() !== '') {
        cleanFilters.user_email = filters.user_email.trim();
      }
      if (filters.client_id && filters.client_id.trim() !== '') {
        cleanFilters.client_id = filters.client_id.trim();
      }

      const [tokensData, statsData] = await Promise.all([
        getRefreshTokens(cleanFilters),
        getRefreshTokenStats(),
      ]);
      setTokens(tokensData.tokens);
      setStats(statsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load refresh tokens');
      toast.error('Failed to load refresh tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string, userEmail: string) => {
    const confirmed = await confirm({
      title: 'Revoke Refresh Token',
      description: `Are you sure you want to revoke this refresh token for ${userEmail}?`,
      confirmText: 'Revoke',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await revokeRefreshToken(id, { reason: 'Manually revoked by admin' });
      toast.success('Refresh token revoked successfully');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to revoke token');
    }
  };

  const handleRevokeAllUser = async (userEmail: string) => {
    const confirmed = await confirm({
      title: 'Revoke All User Tokens',
      description: `Are you sure you want to revoke ALL tokens for ${userEmail}? This will log them out of all sessions.`,
      confirmText: 'Revoke All',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      const result = await revokeAllUserTokens(userEmail, { reason: 'All tokens revoked by admin' });
      toast.success(`${result.revoked_count} token(s) revoked successfully`);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to revoke tokens');
    }
  };

  const handleCleanupExpired = async () => {
    const confirmed = await confirm({
      title: 'Cleanup Expired Tokens',
      description: 'Are you sure you want to cleanup all expired tokens? This action cannot be undone.',
      confirmText: 'Cleanup',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      const result = await cleanupExpiredTokens();
      toast.success(`${result.deleted_count} expired token(s) deleted`);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to cleanup expired tokens');
    }
  };

  const handleFilterChange = () => {
    loadData();
  };

  const getTokenStatus = (token: RefreshToken): 'active' | 'expired' | 'revoked' => {
    if (token.revoked_at) return 'revoked';
    if (new Date(token.expires_at) < new Date()) return 'expired';
    return 'active';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  };

  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  const handleClientIdChange = (value: string) => {
    setFilters({ ...filters, client_id: value || undefined });

    // Validate UUID format
    if (value && value.trim() !== '' && !isValidUUID(value.trim())) {
      setClientIdError('Invalid UUID format');
    } else {
      setClientIdError(null);
    }
  };

  if (!admin || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={loadData} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Refresh Tokens</h1>
          <p className="text-muted-foreground">Manage OAuth refresh tokens and sessions</p>
        </div>
        <Button variant="destructive" onClick={handleCleanupExpired}>
          <Trash2 className="mr-2 h-4 w-4" />
          Cleanup Expired
        </Button>
      </div>

      {stats && (
        <div className="mb-6 grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active_tokens}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expired Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.expired_tokens}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Revoked Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.revoked_tokens}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active_users}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clients with Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.clients_with_tokens}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter refresh tokens by user, client, or status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="user_email">User Email</Label>
              <Input
                id="user_email"
                placeholder="user@example.com"
                value={filters.user_email || ''}
                onChange={(e) => setFilters({ ...filters, user_email: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={filters.client_id || ''}
                onChange={(e) => handleClientIdChange(e.target.value)}
                className={clientIdError ? 'border-destructive' : ''}
              />
              {clientIdError && (
                <p className="text-sm text-destructive">{clientIdError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) =>
                  setFilters({ ...filters, status: value === 'all' ? undefined : value as 'active' | 'expired' | 'revoked' })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleFilterChange} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Apply Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Refresh Tokens</CardTitle>
          <CardDescription>
            {tokens.length} token{tokens.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No refresh tokens found with the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>User Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((token) => {
                    const status = getTokenStatus(token);
                    return (
                      <TableRow key={token.id}>
                        <TableCell>
                          <div className="font-medium">{token.client_name || token.client_id}</div>
                          {token.client_name && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {token.client_id}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{token.user_email}</TableCell>
                        <TableCell>
                          {status === 'active' && (
                            <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                              Active
                            </Badge>
                          )}
                          {status === 'expired' && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                              Expired
                            </Badge>
                          )}
                          {status === 'revoked' && (
                            <Badge variant="destructive">
                              Revoked
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(token.created_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(token.expires_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(token.last_used_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {status === 'active' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevoke(token.id, token.user_email)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevokeAllUser(token.user_email)}
                                  title="Revoke all tokens for this user"
                                >
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
