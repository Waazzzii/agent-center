'use client';

/**
 * useAiModels — the model catalog, from the backend.
 *
 * Replaces a hardcoded list in AiStepFormBody. That list was one of three
 * copies of the same decision across three repos, and they drifted: the MCP's
 * allowlist still named only the previous generation, so authoring a step on a
 * current model through the MCP was rejected while this dropdown offered it.
 * Nothing failed to build — the surfaces just disagreed about what existed.
 *
 * Returns retired models too (`is_active: false`). A step still running on one
 * has to render as its label rather than a bare id, so the caller needs the
 * whole catalog and picks `selectable` for the list of things a NEW step may
 * choose.
 */

import { useCallback, useEffect, useState } from 'react';
import { listAiModels, type AiModel } from '@/lib/api/ai-steps';

/**
 * Shown while the catalog is in flight, and if it cannot be reached.
 *
 * A model picker that renders empty on a slow request looks like a broken form,
 * and someone will save through it. This is a floor, not a second source of
 * truth — it is deliberately one entry, so a stale copy of the full list cannot
 * quietly drift here the way it did before.
 */
const FALLBACK: AiModel[] = [
  { model_id: 'claude-sonnet-5', label: 'Claude Sonnet 5', is_active: true, is_default: true, sort_order: 0, notes: null },
];

export function useAiModels(orgId: string | null | undefined) {
  const [models, setModels] = useState<AiModel[]>(FALLBACK);
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-5');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { models: rows, default_model } = await listAiModels(orgId);
      // An empty catalog means migration 355 has not run. Keeping the fallback
      // is better than an empty picker, and `failed` lets the caller say so.
      if (rows.length > 0) {
        setModels(rows);
        setDefaultModel(default_model);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);

  return {
    /** Every row, retired included — for labelling a step's current model. */
    models,
    /** Only what a NEW step may be created on. */
    selectable: models.filter((m) => m.is_active),
    defaultModel,
    loading,
    /** The catalog could not be read, or came back empty. */
    failed,
    reload,
  };
}
