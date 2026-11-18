# Forge Creator 2.0

Forge Creator 2.0 is the platform-owner control plane for Forge Industrial Safety 2.0.

## Control hierarchy

1. Forge system defaults
2. Forge Creator policy and feature configuration
3. Subscription plan entitlements
4. Tenant/company overrides where Creator allows them
5. Location overrides where Creator allows them
6. User preferences and permission overrides where Creator allows them

A lower layer can never exceed the limits established by the layers above it.

## Creator domains

- Platform dashboard
- Tenant lifecycle
- Plans and subscriptions
- Entitlements and feature flags
- Usage limits and overages
- Billing operations
- Contracts
- Domains
- Global users
- Platform roles
- Tenant permissions
- Lookup/dropdown management
- Navigation builder
- Page/content builder
- Form and field builder
- Workflow builder
- Dashboard builder
- Reporting builder
- Communications
- Branding and themes
- Integrations
- Storage and usage
- Platform health
- Release/beta controls
- Audit and security
- Data administration

## Configuration states

Every configurable Forge capability must support the Creator policy:

- Locked On
- Configurable
- Locked Off

Configurable settings can additionally define whether overrides are allowed at tenant, location, and user levels.

## Feature registry

Every module, page, action, field, workflow, integration and meaningful platform capability receives a permanent feature key.

Examples:

- personnel
- training
- incidents
- inspections
- osha
- workers_comp
- dot
- fleet
- loto
- reporting
- incidents.approve
- training.online_testing

Feature keys are internal identifiers and must not change when a display label is renamed.

## Permission model

Tenant permissions use a centralized permission registry controlled by Forge Creator.

Tenant admins get a highly visual permission editor based on:

- On/off switches
- Checkboxes
- Role templates
- Scope selectors
- Plain-English descriptions
- Individual overrides

Individual permission overrides are tri-state:

- Inherit
- Allow
- Deny

Typical access scopes:

- Own
- Assigned personnel
- Location
- Division
- Entire organization

Sensitive actions such as delete, export, billing changes, role management, restricted information and destructive actions are marked sensitive and can require confirmation and auditing.

## Lookup/dropdown management

Every configurable dropdown is represented by a lookup definition and stable option keys.

Creator controls whether tenant admins may:

- Rename the dropdown
- Reorder options
- Add custom options
- Hide core options
- Delete core options

Core keys remain stable even if the tenant changes the display label.

## Subscription architecture

Plans contain default entitlements and usage allowances.

A tenant subscription can override negotiated commercial terms such as:

- Price
- Contract period
- Price escalation
- Storage allowance
- Email allowance
- SMS allowance
- Overage rules
- Add-ons

Tenant-specific feature overrides do not require creation of a new plan.

## Security boundary

Forge Creator is not a tenant-admin function.

Platform roles:

- FORGE_OWNER
- FORGE_CREATOR
- FORGE_SUPPORT
- FORGE_BILLING
- FORGE_READ_ONLY

Creator database tables are service-role controlled by default. Tenant-facing access must be added only through explicit, reviewed policies or server-side APIs.

## Audit rule

Every material Creator mutation must produce an audit event recording:

- Actor
- Tenant when applicable
- Action
- Entity type and ID
- Before value
- After value
- Reason when required
- Timestamp
- Request/correlation ID when available

## Build sequence

### Phase C1 — Control-plane foundation
Database schema, feature registry, permission registry, Creator shell, audit model.

### Phase C2 — Tenant and subscription operations
Tenant lifecycle, tenant detail, plans, subscriptions, negotiated overrides, usage allowances.

### Phase C3 — Entitlements and configuration inheritance
Effective feature calculation, Locked On/Configurable/Locked Off behavior, tenant configuration portal.

### Phase C4 — Permissions
Role templates, granular switches, scopes, individual overrides, effective-access viewer.

### Phase C5 — Lookup and navigation builders
Dropdown manager, menu builder, tenant overrides, protected system keys.

### Phase C6 — Page, form and workflow builders
Page sections, fields, forms, approval workflows, validation and versioning.

### Phase C7 — Operational SaaS controls
Billing operations, usage metering, contracts, domains, communications, support tools and health.

### Phase C8 — Release and governance
Draft/publish, version history, rollback, beta releases, migration awareness and comprehensive audit tooling.
