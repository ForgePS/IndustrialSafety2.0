/**
 * PostgreSQL RLS helpers for tenant isolation (ADR-014).
 * Applied by drizzle/0001_sprint_1d_platform_core.sql.
 *
 * Session GUCs (transaction-local via set_config(..., true)):
 *   app.current_tenant_id
 *   app.current_user_id
 *
 * Missing or invalid tenant context denies access to tenant-owned tables.
 */

/** Expression used by tenant-scoped RLS policies. */
export const TENANT_RLS_PREDICATE = `
  tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
`;

/** Builds a FORCE ROW LEVEL SECURITY policy block for a tenant-owned table. */
export function tenantRlsPolicySql(tableName: string): string {
  return `
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${tableName}_tenant_isolation ON ${tableName};
CREATE POLICY ${tableName}_tenant_isolation ON ${tableName}
  USING (${TENANT_RLS_PREDICATE.trim()})
  WITH CHECK (${TENANT_RLS_PREDICATE.trim()});
`.trim();
}

/**
 * Predicate for tables whose tenant_id is nullable because the row may be
 * platform-scoped (inbound events with no tenant context).
 */
export const NULLABLE_TENANT_RLS_PREDICATE = `
  tenant_id IS NULL
  OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  OR current_setting('app.bypass_rls', true) = 'on'
`;

/** Tables with a direct tenant_id column using the standard isolation policy. */
export const TENANT_RLS_TABLES = [
  "tenant_domains",
  "tenant_settings",
  "tenant_branding",
  "report_definitions",
  "report_favorites",
  "report_executions",
  "report_exports",
  "report_schedules",
  "report_recipients",
  "report_shares",
  "facilities",
  "organizations",
  "organization_identifiers",
  "persons",
  "person_sensitive_data",
  "person_identifiers",
  "person_contacts",
  "person_addresses",
  "person_merge_history",
  "person_duplicate_candidates",
  "users",
  "authentication_identities",
  "user_invitations",
  "organization_memberships",
  "user_tenant_access",
  "roles",
  "user_role_assignments",
  "authorization_decision_log",
  "tenant_products",
  "tenant_module_entitlements",
  "subscriptions",
  "subscription_events",
  // Sprint 1E additions.
  "user_tenant_memberships",
  "membership_role_assignments",
  "membership_product_access",
  "membership_module_access",
  "membership_history",
  "idempotency_records",
  "customer_onboarding_sessions",
  "customer_onboarding_steps",
  // NERIS Phase 1 tenant overlays.
  "tenant_neris_configuration",
  "tenant_neris_field_overlays",
  "tenant_neris_value_overlays",
  // NERIS Phase 2 RMS master data.
  "rms_stations",
  "rms_shifts",
  "rms_apparatus",
  "rms_units",
  "rms_personnel",
  "rms_daily_rosters",
  "rms_roster_assignments",
  "rms_occupancies",
  "rms_preplans",
  // NERIS Phase 2 incident shell.
  "neris_incident_number_configs",
  "neris_incident_number_sequences",
  "neris_incident_numbers",
  "neris_incidents",
  "neris_incident_status_history",
  "neris_incident_sections",
  "neris_incident_repeatable_groups",
  "neris_incident_repeatable_items",
  "neris_incident_field_values",
  "neris_incident_units",
  "neris_incident_personnel",
  "neris_incident_locations",
  "neris_incident_addresses",
  "neris_incident_timestamps",
  "neris_incident_validation_runs",
  "neris_incident_validation_results",
  "neris_incident_review_assignments",
  "neris_incident_review_comments",
  "neris_incident_schema_snapshots",
  "neris_incident_configuration_snapshots",
  "neris_incident_activity",
  "neris_incident_narratives",
  "neris_incident_narrative_versions",
  // NERIS Phase 4 CAD (strict tenant_id).
  "cad_connections",
  "cad_webhook_keys",
  "cad_raw_messages",
  "cad_normalized_events",
  "cad_comments",
  "cad_webhook_replay_cache",
  "cad_unmapped_values",
  // NERIS Phase 4C CAD links / conflicts / provenance.
  "cad_incident_links",
  "cad_conflicts",
  "cad_field_provenance",
  "cad_manual_fallback_sessions",
  // NERIS Phase 4D unit/personnel mapping.
  "cad_unit_mappings",
  "cad_unknown_units",
  "cad_personnel_mappings",
  "cad_unknown_personnel",
  // NERIS Phase 4E outage / health.
  "cad_connection_outages",
  "cad_connection_health_logs",
  // AI Narrative foundation.
  "ai_narrative_requests",
  "ai_narrative_sources",
  "ai_narrative_drafts",
  "ai_narrative_revisions",
  "ai_narrative_feedback",
  "ai_narrative_usage",
  "ai_narrative_audit_events",
  // Configuration Platform.
  "config_objects",
  "config_versions",
] as const;

/** Tenant-owned tables whose tenant_id may legitimately be null. */
export const NULLABLE_TENANT_RLS_TABLES = [
  "event_processing_records",
  // Global CAD mapping templates (tenant_id NULL) + tenant copies.
  "cad_mapping_profiles",
  "cad_mapping_versions",
  "cad_mapping_rules",
  "cad_mapping_value_aliases",
  // Platform or tenant-scoped retention audit rows.
  "cad_retention_runs",
  // Platform-scoped AI config may use null tenant_id for system defaults.
  "ai_provider_configurations",
  "ai_model_policies",
  "ai_narrative_policies",
  "ai_narrative_templates",
  "ai_narrative_template_versions",
] as const;
