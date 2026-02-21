/**
 * API Types
 * Shared types for API requests and responses
 */

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN = 'org_admin'
}

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  assignedOrganizations: string[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Connector Configuration Schema Types
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'url'
  | 'email'
  | 'password';

export interface ConnectorSchemaField {
  key: string;                      // Field identifier (e.g., "api_key")
  label: string;                    // Display label (e.g., "API Key")
  type: FieldType;                  // Input type
  required?: boolean;               // Is field required?
  secret?: boolean;                 // Should be hidden (for passwords, API keys)
  default?: string | number | boolean; // Default value
  placeholder?: string;             // Input placeholder text
  helpText?: string;                // Description/help text below field

  // For 'select' type
  options?: Array<{
    value: string;
    label: string;
  }>;

  // Validation rules
  validation?: {
    min?: number;                   // Min value (number) or length (text)
    max?: number;                   // Max value (number) or length (text)
    pattern?: string;               // Regex pattern for validation
    customMessage?: string;         // Custom validation error message
  };
}

export interface ConnectorConfigSchema {
  fields: ConnectorSchemaField[];
  version?: string; // For future schema versioning
}

// Base connector definition (catalog)
export interface Connector {
  id: string;
  key: string;
  name: string;
  description?: string;
  icon_url?: string;
  documentation_url?: string;
  available_endpoints: string[];
  configuration_schema?: ConnectorConfigSchema;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// Organization connector configuration
export interface OrganizationConnector {
  id: string;
  organization_id: string;
  connector_id: string;
  connector_key: string;
  connector_name: string;
  configuration: Record<string, any>;
  secret_info: {
    secret_fields: string[];  // Array of field keys that have secrets (e.g., ["api_key", "api_secret"])
    masked_values?: Record<string, string>;  // Masked secret values (only present on single GET, not list)
    last_updated: string;
  } | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  external_id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  picture_url?: string;
  phone?: string;
  organization_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  slug: string;
  description?: string;
  organization_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface OAuthClient {
  id: string;
  client_id: string;
  organization_id: string;
  client_name: string;
  redirect_uri: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  client_secret?: string; // Only returned on creation
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

// Administrator
export interface Administrator {
  id: string;
  email: string;
  role: 'super_admin' | 'org_admin';
  assigned_organizations: string[];
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

// User Groups
export interface UserGroup {
  id: string;
  user_id: string;
  group_id: string;
  role: 'member' | 'admin' | 'owner';
  created_at: string;
  email?: string;
  user_name?: string;
  group_name?: string;
}

// Group Organization Connectors
// Links groups to organization-specific connector instances
export interface GroupConnector {
  id: string;
  group_id: string;
  organization_connector_id: string; // References organization_connectors.id
  authorized_endpoints: string[];
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  connector_key?: string;
  connector_name?: string;
  connector_available_endpoints?: string[];
}

// Refresh Tokens
export interface RefreshToken {
  id: string;
  client_id: string;
  user_email: string;
  user_sub: string;
  scope: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  revoked_by: string | null;
  issued_ip_address: string | null;
  issued_user_agent: string | null;
  last_used_ip_address: string | null;
  last_used_user_agent: string | null;
  client_name?: string;
}

export interface RefreshTokenStats {
  active_tokens: number;
  expired_tokens: number;
  revoked_tokens: number;
  active_users: number;
  clients_with_tokens: number;
}

// DTOs for Create/Update operations
export interface CreateAdministratorDto {
  email: string;
  role: 'super_admin' | 'org_admin';
  assigned_organizations?: string[];
}

export interface UpdateAdministratorDto {
  email?: string;
  role?: 'super_admin' | 'org_admin';
  assigned_organizations?: string[];
}

export interface CreateConnectorDto {
  key: string;
  name: string;
  description?: string;
  icon_url?: string;
  documentation_url?: string;
  available_endpoints?: string[];
  configuration_schema?: ConnectorConfigSchema;
  is_active?: boolean;
  is_public?: boolean;
}

export interface UpdateConnectorDto {
  key?: string;
  name?: string;
  description?: string;
  icon_url?: string;
  documentation_url?: string;
  available_endpoints?: string[];
  configuration_schema?: ConnectorConfigSchema;
  is_active?: boolean;
  is_public?: boolean;
}

export interface AddUserToGroupDto {
  user_id: string;
  role?: 'member' | 'admin' | 'owner';
}

export interface UpdateUserGroupRoleDto {
  role: 'member' | 'admin' | 'owner';
}

export interface CreateGroupConnectorDto {
  organization_connector_id: string; // ID of the organization connector
  authorized_endpoints?: string[];
  is_enabled?: boolean;
}

export interface UpdateGroupConnectorDto {
  authorized_endpoints?: string[];
  is_enabled?: boolean;
}

// User DTOs
export interface CreateUserDto {
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone?: string;
  is_active?: boolean;
}

export interface UpdateUserDto {
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone?: string;
  is_active?: boolean;
}

// Group DTOs
export interface CreateGroupDto {
  name: string;
  slug: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateGroupDto {
  name?: string;
  slug?: string;
  description?: string;
  is_active?: boolean;
}

// Organization Connector Configuration DTOs (for linking connectors to orgs)
export interface CreateConnectorConfigDto {
  connector_id: string;
  configuration?: Record<string, any>;
  secrets?: Record<string, string>;
  is_enabled?: boolean;
}

export interface UpdateConnectorConfigDto {
  configuration?: Record<string, any>;
  secrets?: Record<string, string>;
  is_enabled?: boolean;
}

export interface APIError {
  error: string;
  message: string;
  details?: any;
}

// ============================================================================
// Knowledge Base settings — mirrors the `kb` table (one instance per org)
// ============================================================================

export type DomainProvisioningStatus = 'verifying' | 'active' | 'failed';

/** Provider-agnostic provisioning config stored in kb.auto_domain_config / custom_domain_config */
export interface DomainConfig {
  status?: DomainProvisioningStatus;
  status_updated_at?: string;
  vercel?: {
    registered: boolean;
    registered_at?: string;
    data?: Record<string, unknown>;
  };
  dns?: {
    provider: 'cloudflare' | 'manual';
    record_id?: string;
    cname_active: boolean;
    provisioned_at?: string;
  };
}

export interface KbOrgSettings {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  /** Display name shown to visitors — falls back to org name if not set */
  name: string | null;
  /** Auto-generated: "{org_slug}-kb.wazzi.io" — always available, never removed */
  auto_domain: string;
  /** Optional custom domain entered by the org admin */
  custom_domain: string | null;
  /** Provisioning state for the auto-assigned domain */
  auto_domain_config: DomainConfig;
  /** Provisioning state for the custom domain (DNS is user-managed) */
  custom_domain_config: DomainConfig;
  /** Which of the 4 standard portals are enabled for this KB instance */
  vendor_enabled: boolean;
  internal_enabled: boolean;
  owner_enabled: boolean;
  guest_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Shape returned by POST /provision-domain */
export interface ProvisionDomainResult {
  domain: string;
  domain_type: 'wazzi' | 'custom';
  cname_target: string;
  dns_instructions: {
    type: 'CNAME';
    name: string;
    value: string;
    auto_provisioned: boolean;
    note: string;
  };
  provisioning: {
    vercel: { registered: boolean; error?: string };
    dns?: { cname_active: boolean; record_id?: string; error?: string };
  };
  vercel_status: Record<string, unknown> | null;
  settings: KbOrgSettings;
}

/** Live Vercel domain verification status (returned alongside settings) */
export interface VercelDomainStatus {
  name: string;
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
}
