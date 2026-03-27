'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getConnectorsByCategory } from '@/lib/api/connectors';
import {
  getDataSourceConfigs,
  bulkUpsertDataSourceConfigs,
  deleteDataSourceConfig,
} from '@/lib/api/data-source-configs';
import type { DataSourceConfig, ConnectorOption } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// ── Cron presets ──────────────────────────────────────────────────────────────

const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Every 15 min',   value: '*/15 * * * *' },
  { label: 'Every 30 min',   value: '*/30 * * * *' },
  { label: 'Every hour',     value: '0 * * * *' },
  { label: 'Every 2 hours',  value: '0 */2 * * *' },
  { label: 'Every 4 hours',  value: '0 */4 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Every 24 hours', value: '0 0 * * *' },
  { label: 'Custom…',        value: '__custom' },
];

const DEFAULT_CRON = '0 * * * *';

function presetValueFor(cron: string): string {
  return CRON_PRESETS.find((p) => p.value === cron)?.value ?? '__custom';
}

// ── Row state ─────────────────────────────────────────────────────────────────

interface RowState {
  connector_id: string;
  cron: string;
  isCustom: boolean;
  customInput: string;
  isActive: boolean;
}

function rowStateFromConfig(cfg: DataSourceConfig): RowState {
  const cron = cfg.refresh_cron ?? DEFAULT_CRON;
  const preset = presetValueFor(cron);
  return {
    connector_id: cfg.org_connector_id ?? '',
    cron,
    isCustom: preset === '__custom',
    customInput: preset === '__custom' ? cron : '',
    isActive: cfg.is_active ?? false,
  };
}

function isDirty(cfg: DataSourceConfig, row: RowState): boolean {
  const savedCron = cfg.refresh_cron ?? DEFAULT_CRON;
  const currentCron = row.isCustom ? row.customInput.trim() : row.cron;
  return (
    row.connector_id !== (cfg.org_connector_id ?? '') ||
    currentCron !== savedCron ||
    row.isActive !== (cfg.is_active ?? false)
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DataSourcesPage() {
  const router = useRouter();
  const { selectedOrgId, selectedOrgName, isOrgAdminView } = useAdminViewStore();
  const permitted = useRequirePermission('admin_data_sources');

  const [configs, setConfigs]     = useState<DataSourceConfig[]>([]);
  const [loading, setLoading]     = useState(false);
  const [connectorsByCategory, setConnectorsByCategory] = useState<Record<string, ConnectorOption[]>>({});
  const [rowState, setRowState]   = useState<Record<string, RowState>>({});
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) { router.push('/organizations'); return; }
    loadConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadConfigs = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const data = await getDataSourceConfigs(selectedOrgId);
      setConfigs(data);

      const rows: Record<string, RowState> = {};
      for (const cfg of data) rows[cfg.key] = rowStateFromConfig(cfg);
      setRowState(rows);

      const results = await Promise.allSettled(
        data.map((cfg) => getConnectorsByCategory(selectedOrgId, cfg.key))
      );
      const byCat: Record<string, ConnectorOption[]> = {};
      data.forEach((cfg, i) => {
        const r = results[i];
        byCat[cfg.key] = r.status === 'fulfilled' ? r.value.connectors : [];
      });
      setConnectorsByCategory(byCat);
    } catch (err: any) {
      toast.error('Failed to load data sources');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const patchRow = (key: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const dirtyKeys = configs.filter((cfg) => {
    const row = rowState[cfg.key];
    return row && isDirty(cfg, row);
  }).map((cfg) => cfg.key);

  const handleSave = async () => {
    if (!selectedOrgId || dirtyKeys.length === 0) return;

    // Rows with no connector selected and an existing config → delete the record entirely
    const toDelete = dirtyKeys.filter((key) => {
      const row = rowState[key];
      const cfg = configs.find((c) => c.key === key);
      return !row.connector_id && cfg?.config_id;
    });

    // Rows with a connector selected → upsert
    const toUpsert = dirtyKeys
      .filter((key) => !!rowState[key].connector_id)
      .map((key) => {
        const row = rowState[key];
        const cronToSave = row.isCustom ? row.customInput.trim() : row.cron;
        return { categoryKey: key, data: { org_connector_id: row.connector_id, refresh_cron: cronToSave, is_active: row.isActive } };
      });

    for (const u of toUpsert) {
      if (!u.data.refresh_cron) { toast.error('Please enter a cron expression for all custom schedules'); return; }
    }

    try {
      setSaving(true);
      const [saved] = await Promise.all([
        toUpsert.length ? bulkUpsertDataSourceConfigs(selectedOrgId, toUpsert) : Promise.resolve([]),
        ...toDelete.map((key) => deleteDataSourceConfig(selectedOrgId, key)),
      ]);
      toast.success('Data sources saved');
      await loadConfigs();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Data Sources</h1>
          <p className="text-muted-foreground">
            Configure data imports for {selectedOrgName}.{' '}
            <a href="/connectors" className="underline hover:text-foreground">
              Set up connectors
            </a>{' '}
            if none appear below.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || dirtyKeys.length === 0}
          className="shrink-0 mt-1"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {configs.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No data categories found.</p>
            ) : (
              <div className="grid grid-cols-[1fr_11rem_auto_14rem_5rem]">

                {/* ── Column headers ── */}
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  Data Category
                </div>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  Connector
                </div>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  Schedule
                </div>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  Last Synced
                </div>
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b text-right">
                  Active
                </div>

                {/* ── Data rows ── */}
                {configs.map((cfg) => {
                  const row = rowState[cfg.key];
                  const options = connectorsByCategory[cfg.key] ?? [];
                  if (!row) return null;

                  const dirty = isDirty(cfg, row);

                  return (
                    <Fragment key={cfg.key}>
                      {/* Category name + description */}
                      <div className="px-4 py-3 border-b min-w-0">
                        <span className={`text-sm font-medium ${dirty ? 'text-primary' : ''}`}>{cfg.label}</span>
                        {cfg.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
                        )}
                      </div>

                      {/* Connector */}
                      <div className="px-3 py-3 border-b flex items-center">
                        <Select
                          value={row.connector_id || '__none'}
                          onValueChange={(v) => patchRow(cfg.key, { connector_id: v === '__none' ? '' : v })}
                        >
                          <SelectTrigger className="h-8 text-xs w-full">
                            <SelectValue placeholder="No connector" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">
                              <span className="text-muted-foreground">No connector</span>
                            </SelectItem>
                            {options.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.connector_name}{!c.is_enabled && ' (disabled)'}
                              </SelectItem>
                            ))}
                            {options.length === 0 && (
                              <SelectItem value="__empty" disabled>
                                None available
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Schedule */}
                      <div className="px-3 py-3 border-b flex items-center">
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={row.isCustom ? '__custom' : row.cron}
                            onValueChange={(v) => {
                              if (v === '__custom') {
                                patchRow(cfg.key, { isCustom: true, customInput: row.cron });
                              } else {
                                patchRow(cfg.key, { isCustom: false, cron: v, customInput: '' });
                              }
                            }}
                            disabled={!row.connector_id}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CRON_PRESETS.map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {row.isCustom && (
                            <>
                              <Input
                                value={row.customInput}
                                onChange={(e) => patchRow(cfg.key, { customInput: e.target.value })}
                                placeholder="0 6 * * 1-5"
                                className="w-28 h-8 text-xs font-mono"
                              />
                              <a
                                href="https://crontab.guru"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground underline hover:text-foreground shrink-0"
                              >
                                guru
                              </a>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Last Synced */}
                      <div className="px-3 py-3 border-b flex items-center">
                        {cfg.last_synced_at ? (
                          <span className="text-xs text-muted-foreground">
                            {new Date(cfg.last_synced_at).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Active */}
                      <div className="px-4 py-3 border-b flex items-center justify-end">
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={(checked) => patchRow(cfg.key, { isActive: checked })}
                        />
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
