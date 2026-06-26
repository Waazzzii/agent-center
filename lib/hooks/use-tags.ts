'use client';

/**
 * useTags — load + mutate the org's tag vocabulary.
 *
 * Shared by every surface that shows tags (list filters, edit-form pickers,
 * the Manage Tags screen). Keeps a single in-memory copy per mount; call
 * reload() after mutations that happen elsewhere. createTag is exposed so the
 * inline "+ create" in TagPicker can persist and immediately reflect a new tag.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listTags,
  createTag as apiCreateTag,
  type Tag,
  type TagInput,
} from '@/lib/api/tags';
import { nextDefaultColor } from '@/components/tags/tag-colors';

export function useTags(orgId: string | null | undefined) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      setTags(await listTags(orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);

  /**
   * Create a tag and fold it into local state. When no color is supplied,
   * picks the next palette color so freshly-created tags are visually
   * distinct without forcing the user through a color step.
   */
  const createTag = useCallback(
    async (data: TagInput): Promise<Tag | null> => {
      if (!orgId) return null;
      const withColor: TagInput = {
        ...data,
        color: data.color ?? nextDefaultColor(tags.length),
      };
      const created = await apiCreateTag(orgId, withColor);
      setTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return created;
    },
    [orgId, tags.length],
  );

  return { tags, loading, reload, setTags, createTag };
}
