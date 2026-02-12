/**
 * Connectors Catalog API Client
 * Helper functions for working with the public connectors catalog
 */

import { getConnectors as getBaseConnectors } from './connectors-base';
import type { Connector } from '@/types/api.types';

export interface PublicConnectorsResponse {
  connectors: Connector[];
  total: number;
}

/**
 * Get all public connectors from the catalog
 * Filters for connectors where is_public = true and is_active = true
 */
export async function getPublicConnectors(): Promise<PublicConnectorsResponse> {
  const { connectors: allConnectors } = await getBaseConnectors();

  // Filter for public and active connectors only
  const publicConnectors = allConnectors.filter(
    (connector) => connector.is_public && connector.is_active
  );

  return {
    connectors: publicConnectors,
    total: publicConnectors.length,
  };
}
