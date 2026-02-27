'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getAuditLogs, type AuditLog, type ActorType, type OperationType } from '@/lib/api/audit-logs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, FileText, Search, X } from 'lucide-react';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;

export default function AuditLogsPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { viewMode } = useAdminViewStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Applied filters (trigger data load)
  const [filters, setFilters] = useState({
    actor_type: 'all' as ActorType | 'all',
    resource_type: '',
    operation: 'all' as OperationType | 'all',
    actor_id: '',
    resource_id: '',
  });

  // Filter form state (user input)
  const [filterForm, setFilterForm] = useState({
    actor_type: 'all' as ActorType | 'all',
    resource_type: '',
    operation: 'all' as OperationType | 'all',
    actor_id: '',
    resource_id: '',
  });

  // Validation errors
  const [validationErrors, setValidationErrors] = useState({
    actor_id: '',
    resource_id: '',
  });

  useEffect(() => {
    if (!admin || !isSuperAdmin()) {
      router.push('/organizations');
      return;
    }

    if (viewMode !== 'super_admin') {
      router.push('/organizations');
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, viewMode]);

  useEffect(() => {
    loadAuditLogs();
  }, [currentPage, filters]);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;

      const params: any = {
        limit: ITEMS_PER_PAGE,
        offset,
      };

      if (filters.actor_type && filters.actor_type !== 'all') params.actor_type = filters.actor_type;
      if (filters.resource_type) params.resource_type = filters.resource_type;
      if (filters.operation && filters.operation !== 'all') params.operation = filters.operation;
      if (filters.actor_id) params.actor_id = filters.actor_id;
      if (filters.resource_id) params.resource_id = filters.resource_id;

      const data = await getAuditLogs(params);
      setLogs(data.logs);
      setTotal(data.total);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  // UUID validation regex
  const isValidUUID = (value: string): boolean => {
    if (!value) return true; // Empty is valid (no filter)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  };

  const handleFormChange = (key: string, value: string) => {
    setFilterForm({ ...filterForm, [key]: value });

    // Validate UUID fields
    if (key === 'actor_id' || key === 'resource_id') {
      if (value && !isValidUUID(value)) {
        setValidationErrors({
          ...validationErrors,
          [key]: 'Must be a valid UUID format',
        });
      } else {
        setValidationErrors({
          ...validationErrors,
          [key]: '',
        });
      }
    }
  };

  const applyFilters = () => {
    // Validate before applying
    const errors = {
      actor_id: filterForm.actor_id && !isValidUUID(filterForm.actor_id) ? 'Invalid UUID format' : '',
      resource_id: filterForm.resource_id && !isValidUUID(filterForm.resource_id) ? 'Invalid UUID format' : '',
    };

    setValidationErrors(errors);

    // Only apply if no validation errors
    if (!errors.actor_id && !errors.resource_id) {
      setFilters(filterForm);
      setCurrentPage(1);
    } else {
      toast.error('Please fix validation errors before applying filters');
    }
  };

  const clearFilters = () => {
    const clearedFilters = {
      actor_type: 'all' as ActorType | 'all',
      resource_type: '',
      operation: 'all' as OperationType | 'all',
      actor_id: '',
      resource_id: '',
    };
    setFilterForm(clearedFilters);
    setFilters(clearedFilters);
    setValidationErrors({ actor_id: '', resource_id: '' });
    setCurrentPage(1);
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== '' && v !== 'all');
  const hasUnappliedChanges = JSON.stringify(filters) !== JSON.stringify(filterForm);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getOperationColor = (operation: OperationType) => {
    switch (operation) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatActorType = (actorType: ActorType) => {
    switch (actorType) {
      case 'super_admin':
        return 'Super Admin';
      case 'org_admin':
        return 'Org Admin';
      case 'user':
        return 'User';
      default:
        return actorType;
    }
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  if (!admin || !isSuperAdmin() || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Audit Logs</h1>
        <p className="text-sm md:text-base text-muted-foreground">View all actions performed by admins and users</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Filter audit logs by various criteria</CardDescription>
            </div>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="w-full sm:w-auto">
                <X className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Actor Type</Label>
              <Select
                value={filterForm.actor_type}
                onValueChange={(value) => handleFormChange('actor_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Resource Type</Label>
              <Input
                placeholder="e.g., user, group, connector"
                value={filterForm.resource_type}
                onChange={(e) => handleFormChange('resource_type', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Operation</Label>
              <Select
                value={filterForm.operation}
                onValueChange={(value) => handleFormChange('operation', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Actor ID (UUID)</Label>
              <Input
                placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
                value={filterForm.actor_id}
                onChange={(e) => handleFormChange('actor_id', e.target.value)}
                className={validationErrors.actor_id ? 'border-red-500' : ''}
              />
              {validationErrors.actor_id && (
                <p className="text-xs text-red-500">{validationErrors.actor_id}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Resource ID (UUID)</Label>
              <Input
                placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
                value={filterForm.resource_id}
                onChange={(e) => handleFormChange('resource_id', e.target.value)}
                className={validationErrors.resource_id ? 'border-red-500' : ''}
              />
              {validationErrors.resource_id && (
                <p className="text-xs text-red-500">{validationErrors.resource_id}</p>
              )}
            </div>
          </div>

          {/* Apply Filters Button */}
          <div className="flex justify-end gap-2">
            <Button
              variant="default"
              onClick={applyFilters}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              <Search className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Apply Filters</span>
              <span className="sm:hidden">Apply</span>
              {hasUnappliedChanges && <span className="hidden md:inline ml-2 text-xs">(unapplied changes)</span>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>
                Showing {logs.length} of {total} total entries
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No audit logs found</p>
              {hasActiveFilters && <p className="text-sm mt-2">Try adjusting your filters</p>}
            </div>
          ) : (
            <>
              <ResponsiveTable
                data={logs}
                getRowKey={(log) => log.id}
                emptyMessage="No audit logs found"
                columns={[
                  {
                    key: 'timestamp',
                    label: 'Timestamp',
                    render: (log) => (
                      <span className="whitespace-nowrap text-sm">{formatDate(log.created_at)}</span>
                    ),
                  },
                  {
                    key: 'actor',
                    label: 'Actor',
                    render: (log) => (
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs text-muted-foreground">
                          {log.actor_id.slice(0, 8)}...
                        </span>
                        <Badge variant="outline" className="w-fit">
                          {formatActorType(log.actor_type)}
                        </Badge>
                      </div>
                    ),
                  },
                  {
                    key: 'operation',
                    label: 'Operation',
                    render: (log) => (
                      <Badge className={getOperationColor(log.operation)}>
                        {log.operation}
                      </Badge>
                    ),
                  },
                  {
                    key: 'resource',
                    label: 'Resource',
                    render: (log) => (
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{log.resource_type}</span>
                        {log.resource_id && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {log.resource_id.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'details',
                    label: 'Details',
                    render: (log) => (
                      <div className="text-xs text-muted-foreground space-y-1">
                        {log.metadata?.ip && <div>IP: {log.metadata.ip}</div>}
                        {log.metadata?.path && (
                          <div className="break-all">
                            {log.metadata.method} {log.metadata.path}
                          </div>
                        )}
                      </div>
                    ),
                  },
                ]}
              />

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground text-center sm:text-left">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="flex-1 sm:flex-none"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Previous</span>
                      <span className="sm:hidden">Prev</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="flex-1 sm:flex-none"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <span className="sm:hidden">Next</span>
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
