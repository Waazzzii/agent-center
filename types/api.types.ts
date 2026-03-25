/**
 * API Types
 * Shared types for API requests and responses
 */

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN   = 'org_admin',
  ORG_USER    = 'org_user',
}

/** Roles that bypass per-permission checks (org_admin is still scoped to their orgs) */
export const BYPASS_PERMISSION_ROLES = [AdminRole.SUPER_ADMIN, AdminRole.ORG_ADMIN];

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  assignedOrganizations: string[];
  /**
   * Fully-resolved effective permissions per org (catalog defaults merged with explicit overrides).
   * Only populated for org_user — super_admin bypasses all permission checks.
   */
  orgPermissions: Record<string, Record<string, boolean>>;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string | null;
  category: string;
  subcategory: string;
  /** CRUD granularity: 'create' | 'read' | 'update' | 'delete' */
  crud_type: 'create' | 'read' | 'update' | 'delete';
  /** true = Administration section (not auto-included in Viewer/Editor defaults) */
  is_admin: boolean;
  sort_order: number;
  default_value: boolean;
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
  | 'password'
  | 'oauth';

export interface ConnectorSchemaField {
  key: string;                      // Field identifier (e.g., "api_key")
  label: string;                    // Display label (e.g., "API Key")
  type: FieldType;                  // Input type
  required?: boolean;               // Is field required?
  secret?: boolean;                 // Should be hidden (for passwords, API keys)
  default?: string | number | boolean; // Default value
  placeholder?: string;             // Input placeholder text
  helpText?: string;                // Description/help text below field
  /** OAuth provider — only relevant when type === 'oauth' */
  provider?: 'google';

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
  oauth?: boolean;  // True for connectors that use OAuth (e.g. Gmail)
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
  /** How the agent authenticates with this connector */
  agent_auth_type?: 'none' | 'google_oauth';
  /** Instruction shown to org admins in the AI Agent → Connectors tab */
  agent_instruction?: string | null;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentAuthorizationStatus {
  is_authorized: boolean;
  authorized_by_email: string | null;
  connected_at: string | null;
  last_refreshed_at: string | null;
}

// Token health status enum
export type TokenHealthStatus = 'healthy' | 'needs_renewal' | 'renewal_failed' | 'expired' | 'unknown';

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
    // Token health tracking (for connectors with expiring tokens)
    expires_at?: string;  // ISO date when token expires
    last_renewed_at?: string;  // ISO date when token was last renewed
    health_status?: TokenHealthStatus;  // Current health status
    // Note: Error details are in audit_log, not sent to frontend
  } | null;
  /** How the agent authenticates with this connector */
  agent_auth_type?: 'none' | 'google_oauth';
  /** Instruction shown to org admins in the AI Agent → Connectors tab */
  agent_instruction?: string | null;
  /** Agent-specific OAuth state (oauth_connected, connected_email, token_expiry) */
  agent_config: Record<string, any>;
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
  is_active: boolean;
  role: 'org_admin' | 'org_user';
  created_at: string;
  updated_at: string;
}

export interface AccessGroup {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  access: Record<string, boolean>;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAccessGroupDto {
  name: string;
  description?: string;
  access?: Record<string, boolean>;
}

export interface UpdateAccessGroupDto {
  name?: string;
  description?: string;
}

export interface OAuthClient {
  id: string;
  client_id: string;
  organization_id: string | null;
  client_name: string;
  redirect_uri: string | null;
  is_active: boolean;
  is_public: boolean;
  description: string | null;
  /** Per-client refresh token TTL in seconds. null = use server default (REFRESH_TOKEN_EXPIRY). */
  refresh_token_expiry_seconds: number | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
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
  agent_auth_type?: 'none' | 'google_oauth';
  agent_instruction?: string;
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
  agent_auth_type?: 'none' | 'google_oauth';
  agent_instruction?: string;
  is_active?: boolean;
  is_public?: boolean;
}

// User DTOs
export interface CreateUserDto {
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone?: string;
  is_active?: boolean;
  /** Access groups to assign on creation. If omitted, the org's default is auto-assigned. */
  access_group_ids?: string[];
  role?: 'org_admin' | 'org_user';
}

export interface UpdateUserDto {
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone?: string;
  is_active?: boolean;
  role?: 'org_admin' | 'org_user';
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
// Product settings — shared across all products (kb, ac, etc.)
// ============================================================================

export type DomainProvisioningStatus = 'verifying' | 'active' | 'failed';

/** Provider-agnostic provisioning config stored in organization_products.auto_domain_config / custom_domain_config */
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

/** Shared fields from organization_products — common to all products */
export interface OrgProductSettings {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  name: string | null;
  auto_domain: string | null;
  custom_domain: string | null;
  auto_domain_config: DomainConfig;
  custom_domain_config: DomainConfig;
  custom_theme: string | null;
  logo_storage_path: string | null;
  favicon_storage_path: string | null;
  created_at: string;
  updated_at: string;
}

/** KB settings — shared product fields, no extra KB-specific fields anymore */
export type KbOrgSettings = OrgProductSettings;

/** Admin Center settings — same shared fields, no portal flags */
export type CenterOrgSettings = OrgProductSettings;

export interface KbPortal {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  access_level: 'public' | 'public_noindex' | 'authenticated';
  default_language: string;
  supported_languages: string[];
  description: string | null;
  seo_crawlable: boolean;
  header_cta_label: string | null;
  header_cta_url: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
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
