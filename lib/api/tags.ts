import agentClient from './agent-client';

/**
 * A tag in the org-scoped vocabulary. Applied to agents, AI steps, and
 * browser scripts via the polymorphic agent_tag_assignments table (backend
 * migration 222). `color` is one of the palette keys in
 * components/tags/tag-colors.ts (null → neutral fallback).
 */
export interface Tag {
  id: string;
  organization_id: string;
  name: string;
  color: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  /** Total assignments across all entity types — only present on list(). */
  usage_count?: number;
}

export interface TagInput {
  name: string;
  color?: string | null;
  description?: string | null;
}

export async function listTags(orgId: string): Promise<Tag[]> {
  const res = await agentClient.get<{ tags: Tag[] }>(`/api/admin/${orgId}/tags`);
  return res.data.tags;
}

export async function createTag(orgId: string, data: TagInput): Promise<Tag> {
  const res = await agentClient.post<Tag>(`/api/admin/${orgId}/tags`, data);
  return res.data;
}

export async function updateTag(orgId: string, id: string, data: Partial<TagInput>): Promise<Tag> {
  const res = await agentClient.patch<Tag>(`/api/admin/${orgId}/tags/${id}`, data);
  return res.data;
}

export async function deleteTag(orgId: string, id: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/tags/${id}`);
}

/**
 * Build the shared `{ tag_ids, tag_match }` query params accepted by the
 * agents / ai-steps / scripts / execution-history list endpoints. Returns an
 * empty object when no tags are selected so callers can spread it
 * unconditionally.
 */
export function tagFilterParams(
  tagIds: string[],
  match: 'any' | 'all' = 'any',
): { tag_ids?: string; tag_match?: 'any' | 'all' } {
  if (!tagIds || tagIds.length === 0) return {};
  return { tag_ids: tagIds.join(','), tag_match: match };
}
