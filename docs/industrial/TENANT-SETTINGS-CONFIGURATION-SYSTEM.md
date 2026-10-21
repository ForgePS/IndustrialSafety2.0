# Forge Industrial Safety
## Complete Tenant Settings & Configuration System

> **Provenance:** Vision specification ingested into the repo on 2026-09-04 from the authoring draft
> (`Forge Industrial Safety - Complete Tenant Settings & Configuration System.md`).
> This document describes the intended end-state product. It is **not** an implementation status
> report. For current coverage vs this vision, see
> [TENANT-SETTINGS-GAP-ANALYSIS.md](./TENANT-SETTINGS-GAP-ANALYSIS.md).

---

# 1. Purpose

The **Settings** area inside each Forge Industrial Safety tenant will serve as the central administrative control system for configuring the platform.

Authorized tenant administrators must be able to customize nearly every aspect of their tenant without requiring Forge developers to modify source code.

The system must support:

- Creating
- Editing
- Duplicating
- Reordering
- Activating
- Deactivating
- Archiving
- Restoring
- Importing
- Exporting
- Versioning
- Publishing
- Deleting where appropriate

This applies to:

- Forms
- Form sections
- Fields
- Dropdown values
- Tables
- Checklists
- Inspections
- Workflows
- Statuses
- Categories
- Record types
- Numbering formats
- Notifications
- Permissions
- Departments
- Locations
- Job titles
- Training configuration
- Safety configuration
- Fleet configuration
- DOT configuration
- Emergency response
- QR codes
- Documents
- Branding
- Dashboards
- Terminology
- Automation
- Integrations
- Custom modules
- Other configurable platform components

The goal is for Forge Industrial Safety to function as a **fully configurable multi-tenant SaaS platform** rather than a collection of hard-coded modules.

---

# 2. Settings Navigation

```text
Settings
│
├── Organization
│   ├── Company Profile
│   ├── Locations
│   ├── Departments
│   ├── Divisions
│   ├── Teams
│   ├── Job Titles
│   ├── Cost Centers
│   └── Organizational Structure
│
├── Users & Access
│   ├── Users
│   ├── Roles
│   ├── Permissions
│   ├── Permission Groups
│   ├── Field-Level Access
│   ├── Module Access
│   ├── Location Access
│   └── Admin Delegation
│
├── Modules
│   ├── Enabled Modules
│   ├── Module Configuration
│   ├── Module Terminology
│   ├── Module Navigation
│   └── Custom Modules
│
├── Forms & Fields
│   ├── Form Builder
│   ├── Field Library
│   ├── Field Groups
│   ├── Dropdown Lists
│   ├── Checklists
│   ├── Templates
│   ├── Form Versions
│   └── Archived Forms
│
├── Workflows
│   ├── Workflow Builder
│   ├── Approval Processes
│   ├── Statuses
│   ├── Corrective Actions
│   ├── Escalations
│   └── Automation Rules
│
├── Records
│   ├── Record Types
│   ├── Categories
│   ├── Numbering
│   ├── Required Fields
│   ├── Retention
│   └── Record Relationships
│
├── Notifications
│   ├── Email
│   ├── SMS
│   ├── In-App
│   ├── Push
│   ├── Notification Rules
│   └── Templates
│
├── Documents & Files
│   ├── Document Types
│   ├── Required Documents
│   ├── File Categories
│   ├── Expiration Rules
│   └── Storage Settings
│
├── QR & Identification
│   ├── QR Templates
│   ├── QR Behavior
│   ├── Asset Labels
│   ├── Employee IDs
│   └── Record Identifiers
│
├── Branding
│   ├── Logos
│   ├── Colors
│   ├── Login Screen
│   ├── Email Branding
│   ├── Report Branding
│   └── Portal Branding
│
├── Reports & Analytics
│   ├── Dashboard Builder
│   ├── KPI Configuration
│   ├── Report Builder
│   ├── Scheduled Reports
│   └── Data Visibility
│
├── Data Management
│   ├── Imports
│   ├── Exports
│   ├── Bulk Updates
│   ├── Data Mapping
│   ├── Archive
│   └── Retention
│
├── Integrations
│   ├── API
│   ├── Webhooks
│   ├── HR Systems
│   ├── ERP
│   ├── Payroll
│   ├── Fleet
│   ├── Printers
│   └── External Applications
│
├── Security
│   ├── Authentication
│   ├── MFA
│   ├── Password Policies
│   ├── Session Policies
│   ├── IP Restrictions
│   └── API Security
│
├── Compliance
│   ├── Acknowledgments
│   ├── Electronic Signatures
│   ├── Audit Requirements
│   ├── Data Retention
│   └── Regulatory Configuration
│
├── Developer / Advanced
│   ├── Custom Fields
│   ├── Custom Objects
│   ├── Custom Modules
│   ├── API Keys
│   ├── Webhooks
│   ├── Feature Flags
│   └── Configuration Export
│
└── Audit & System
    ├── Settings Audit Log
    ├── Change History
    ├── Configuration Versions
    ├── Restore Configuration
    └── System Information
```

---

# 3. Tenant Isolation

Every configurable object must contain a tenant identifier.

Example:

```text
tenant_id
```

No tenant configuration may modify another tenant.

Configuration hierarchy:

```text
Forge Platform Defaults
        ↓
Tenant Configuration
        ↓
Location Override
        ↓
Department Override
        ↓
Role/User Override
```

Tenant settings override Forge defaults without modifying the underlying Forge platform configuration.

---

# 4. Form Builder

The Form Builder should be one of the most powerful areas of Forge.

Tenant administrators must be able to build forms without programming.

## Form Controls

Administrators can:

- Create form
- Rename form
- Duplicate form
- Delete unused form
- Archive form
- Restore form
- Activate/deactivate
- Set form owner
- Assign module
- Assign location
- Assign department
- Assign user group
- Reorder sections
- Reorder fields
- Configure workflow
- Configure approval
- Configure notifications
- Configure permissions
- Preview form
- Test form
- Publish form
- Roll back form version

---

# 5. Form Sections

Forms can contain unlimited configurable sections.

Example:

```text
Incident Information
Employee Information
Location Information
Injury Information
Witnesses
Immediate Actions
Root Cause
Corrective Actions
Supervisor Review
Safety Review
Attachments
Signatures
```

Administrators can:

- Add section
- Rename section
- Reorder section
- Collapse section
- Hide section
- Conditionally display section
- Restrict section by role
- Duplicate section
- Delete unused section

---

# 6. Field Builder

Administrators must be able to add custom fields to Forge records and forms.

## Supported Field Types

### Basic

- Single-line text
- Multi-line text
- Integer
- Decimal
- Currency
- Percentage
- Date
- Time
- Date/time
- Yes/no
- Checkbox
- Toggle

### Selection

- Dropdown
- Multi-select
- Radio button
- Checkbox group
- Searchable dropdown

### Personnel

- Employee
- Supervisor
- Department
- Location
- Job title
- Team
- Contractor

### Safety

- Incident type
- Injury type
- Body part
- Hazard category
- PPE
- Root cause
- Corrective action
- Severity
- Risk level

### Asset

- Asset
- Equipment
- Vehicle
- Machine
- Forklift
- Chemical
- Facility

### Special

- Signature
- Initials
- Photo
- Video
- Attachment
- QR scan
- Barcode scan
- GPS location
- Address
- Phone
- Email
- URL
- Calculated field
- Formula
- Auto-generated number
- Rich text
- Instructions
- Divider
- Heading

---

# 7. Field Configuration

Every field should support:

```text
Field Name
Internal Field Key
Label
Description
Help Text
Placeholder
Field Type
Default Value
Required
Read Only
Hidden
Searchable
Sortable
Reportable
Exportable
Sensitive
Encrypted
Unique
Minimum Value
Maximum Value
Character Limit
Validation Rule
Display Width
Conditional Logic
Permission Rules
Module
Form
Section
Location
Department
Status
```

---

# 8. Conditional Logic

Forms must support no-code conditional logic.

Example:

```text
IF
Incident Type = Injury

THEN
Show Injury Information Section
```

Another example:

```text
IF
Employee Required Medical Treatment = Yes

THEN
Require:
- Treatment Facility
- Treatment Date
- Provider
- Workers Compensation Case
```

Logic should support:

- Equals
- Does not equal
- Contains
- Does not contain
- Greater than
- Less than
- Is blank
- Is not blank
- Before
- After
- Is one of
- Is not one of

Multiple rules should support:

```text
AND
OR
```

---

# 9. Dropdown / List Manager

Administrators must be able to control dropdown values globally.

Example:

```text
Injury Type
- Burn
- Laceration
- Sprain
- Strain
- Fracture
- Contusion
- Exposure
- Foreign body
- Other
```

Each value should support:

- Name
- Description
- Code
- Order
- Active/inactive
- Color indicator
- Effective date
- Retired date

Dropdowns can be:

```text
Forge Standard
Tenant Custom
Location Specific
Department Specific
```

---

# 10. Custom Objects

Forge should eventually support complete custom objects.

Examples:

```text
Confined Space Permit
Safety Observation
Machine Inspection
Custom Equipment Type
Environmental Sample
Contractor Audit
Site Security Check
Custom Medical Surveillance Record
```

Admins should configure:

```text
Object Name
Plural Name
Icon
Module
Fields
Relationships
Forms
Workflow
Permissions
Reports
Navigation
Numbering
Retention
```

This effectively allows tenants to create functionality that was not originally included in Forge.

---

# 11. Record Relationships

Admins should be able to define relationships between records.

Examples:

```text
Employee → Incident
Employee → Training
Vehicle → Inspection
Machine → LOTO Procedure
Chemical → SDS
Corrective Action → Incident
Corrective Action → Inspection
Location → Emergency Plan
Contractor → Permit
```

Supported relationship types:

- One-to-one
- One-to-many
- Many-to-many

---

# 12. Workflow Builder

Every major record type should support configurable workflow.

Example:

```text
Draft
↓
Submitted
↓
Supervisor Review
↓
Safety Review
↓
Corrective Action Required
↓
Final Review
↓
Closed
```

Admins can:

- Create status
- Rename status
- Change status color
- Reorder status
- Define available transitions
- Require approval
- Restrict who can transition
- Trigger notifications
- Trigger tasks
- Trigger corrective actions
- Require signatures
- Require fields
- Automatically escalate

---

# 13. Automation Engine

Settings should contain a no-code automation builder.

## Trigger Examples

```text
Record Created
Record Updated
Status Changed
Inspection Failed
Training Expiring
Certification Expiring
Corrective Action Overdue
Vehicle Inspection Due
DOT Item Due
Document Expiring
Incident Submitted
Employee Added
Form Completed
QR Code Scanned
```

## Conditions

```text
Location
Department
Severity
Record Type
Employee
Supervisor
Status
Date
Risk Level
Custom Field
```

## Actions

```text
Send Email
Send SMS
Send In-App Notification
Create Task
Assign Corrective Action
Assign Training
Notify Supervisor
Notify Safety Manager
Change Status
Create Record
Generate Document
Call Webhook
Update Field
Escalate Record
```

---

# 14. Role & Permission Builder

Permissions must be configurable at multiple levels.

## Permissions

```text
View
Create
Edit
Delete
Archive
Restore
Approve
Assign
Close
Export
Print
Configure
Administer
```

## Permission Scope

```text
Entire Tenant
Location
Department
Team
Assigned Records
Own Records
Direct Reports
Selected Record Types
```

---

# 15. Field-Level Permissions

Sensitive fields need separate permissions.

Example:

```text
Workers Compensation Cost

Safety Manager:
View: Yes
Edit: Yes

Supervisor:
View: No
Edit: No
```

This is particularly important for:

- Medical information
- Workers compensation
- Employee investigations
- Drug testing
- HR data
- Financial information
- Legal information

---

# 16. Module Management

Tenant admins should see every module included in their subscription.

Example:

```text
Core
Safety
Training
Emergency
Fleet
DOT
Inspections
Incidents
Forms
QR Scan
JSAs
LOTO
Confined Space
Hot Work
Working at Heights
Electrical
Cranes
Machine Safety
Chemical
Warehouse
Manufacturing
Contractor Safety
Process Safety
Environmental
Scheduler
Messaging
Workers Compensation
Analytics
```

Depending on subscription permissions, administrators can:

- Enable module
- Disable module
- Rename module
- Change icon
- Change navigation position
- Configure default dashboard
- Configure terminology
- Configure forms
- Configure permissions

Subscription-controlled modules should not be unlockable by the tenant unless licensed.

---

# 17. Navigation Builder

Admins should be able to customize navigation.

Example:

```text
Dashboard
Employees
Safety
Training
Fleet
DOT
Emergency
Reports
```

Administrators can:

- Reorder menu
- Rename menu
- Hide items
- Show items
- Create navigation groups
- Assign navigation by role
- Assign navigation by department
- Add custom links

---

# 18. Tenant Terminology

Companies use different terms.

Forge should allow administrators to change display terminology.

Examples:

```text
Employees → Team Members
Locations → Plants
Departments → Divisions
Supervisors → Managers
Incidents → Events
Corrective Actions → Action Items
Training → Learning
```

Internal database names remain unchanged.

---

# 19. Numbering System

Admins configure identifiers.

Example:

```text
Incident:
INC-2026-000001

Inspection:
INS-2026-000001

Corrective Action:
CA-2026-000001

Vehicle:
VEH-0001

Equipment:
EQ-0001
```

Configuration:

```text
Prefix
Year
Location Code
Department Code
Sequence Length
Starting Number
Reset Annually
```

---

# 20. Organization Configuration

Admins maintain:

- Company information
- Addresses
- Contacts
- Federal identifiers
- NAICS
- Timezone
- Date format
- Units of measure
- Fiscal year
- Operating schedule

---

# 21. Location Manager

Locations should be configurable records.

Fields:

```text
Location Name
Location Code
Address
Latitude
Longitude
Time Zone
Phone
Manager
Safety Manager
Emergency Contact
Operating Hours
Active/Inactive
```

Locations can have individual settings overrides.

---

# 22. Department Manager

Administrators can:

- Create department
- Edit
- Merge
- Archive
- Assign manager
- Assign safety contact
- Associate location
- Configure permissions
- Configure forms
- Configure training

---

# 23. Branding

Tenant administrators configure:

- Primary logo
- Dark logo
- Favicon
- Login logo
- Primary color
- Secondary color
- Accent color
- Email header
- PDF header
- Report footer
- Customer portal branding
- Training portal branding
- QR label branding

---

# 24. Custom Dashboards

Administrators should build dashboards through drag-and-drop widgets.

Widgets:

- Metric card
- Bar chart
- Line chart
- Pie chart
- Table
- Calendar
- Map
- Task list
- Open corrective actions
- Incident trend
- Training compliance
- Expiring certifications
- Fleet compliance
- DOT compliance
- Inspection completion
- Custom report

Dashboards may be assigned by:

```text
Role
Location
Department
Module
Individual User
```

---

# 25. Report Builder

Tenant admins should be able to build reports using any authorized reportable field.

Configure:

```text
Data Source
Columns
Filters
Grouping
Sorting
Calculations
Charts
Date Range
Location
Department
Export Format
Schedule
Recipients
```

Exports:

- PDF
- CSV
- XLSX
- Print

---

# 26. Notification Templates

Admins can edit templates.

Example:

```text
Corrective Action Overdue
```

Template variables:

```text
{{employee_name}}
{{record_number}}
{{location}}
{{department}}
{{due_date}}
{{record_link}}
```

Channels:

- Email
- SMS
- In-app
- Push

---

# 27. Email Settings

Tenant configurable:

- Sender name
- Reply-to address
- Footer
- Logo
- Notification preferences
- Template library

Forge-controlled infrastructure settings remain inaccessible.

---

# 28. QR Configuration

Admins can configure what happens when QR codes are scanned.

Examples:

```text
Equipment QR
↓
Equipment Profile

Machine QR
↓
Machine Safety Page

Training QR
↓
Training Login

Customer QR
↓
Customer Portal

Inspection QR
↓
Inspection Form
```

QR templates can specify:

- Label size
- Logo
- QR size
- Identifier text
- Instructions
- Printer
- Print quantity

---

# 29. Document Management Settings

Configure:

- Document types
- Required documents
- Expiration rules
- Renewal periods
- Categories
- Access
- Retention
- Approval
- Version control

Examples:

```text
Driver License
CDL
OSHA Card
Certification
SDS
Insurance
Inspection Report
Medical Clearance
Training Certificate
```

---

# 30. Data Retention

Retention policy can be configured by record type where permitted.

Example:

```text
Safety Incident: 10 years
Training Record: Permanent
Vehicle Inspection: 5 years
General Form: 3 years
```

Forge must prevent administrators from selecting retention policies that conflict with hard-coded legal/compliance requirements where applicable.

---

# 31. Import Center

Administrators should import:

- Employees
- Training
- Assets
- Vehicles
- Chemicals
- Locations
- Departments
- Inspections
- Certifications
- Custom records

Workflow:

```text
Upload File
↓
Map Columns
↓
Validate
↓
Preview
↓
Resolve Errors
↓
Import
↓
Import Report
```

---

# 32. Configuration Import / Export

Tenant configuration can be exported as a Forge configuration package.

Example:

```text
FORGE-CONFIG
```

Includes:

- Forms
- Fields
- Dropdowns
- Workflows
- Automation
- Roles
- Permissions
- Dashboards
- Report templates
- Settings

Useful for:

- Sandbox → Production
- Location rollout
- Corporate templates
- New tenant onboarding
- Backup

---

# 33. Settings Versioning

Every significant settings change must create a configuration version.

Example:

```text
Version 37

Changed By:
John Smith

Date:
09/04/2026 10:08 AM

Changes:
Added "Near Miss" incident type
Modified Injury form
Added Safety Manager approval
```

Options:

```text
View Changes
Compare Versions
Restore Version
```

---

# 34. Draft / Publish Model

Complex configuration changes should not immediately affect production.

Workflow:

```text
Current Published Version
        ↓
Create Draft
        ↓
Modify
        ↓
Preview
        ↓
Validate
        ↓
Publish
```

This is particularly important for:

- Forms
- Workflows
- Fields
- Permissions
- Automations

---

# 35. Form Versioning

Historical records must retain the form configuration used when the record was submitted.

Example:

```text
Incident Form Version 3
Submitted: March 5, 2026
```

If the admin publishes Version 4 later, the historical incident still renders using Version 3.

---

# 36. Deleting Fields

Fields containing historical data should **not** normally be physically deleted.

Instead:

```text
Active
Inactive
Archived
```

If an administrator attempts to delete a field containing data:

> This field contains 8,422 historical values and cannot be permanently deleted. You may archive the field instead.

This protects historical records and analytics.

---

# 37. Deleting Forms

Forms with records should be archived rather than destroyed.

Forms without records can be permanently deleted by users with appropriate permission.

---

# 38. Dependency Detection

Before deleting anything, Forge should display dependencies.

Example:

```text
You are attempting to archive:

Field:
Incident Severity

Used By:
3 Forms
4 Reports
2 Automation Rules
1 Dashboard
2 Workflows
```

Admin must resolve dependencies before destructive changes.

---

# 39. Undo / Restore

Deleted or archived configurable items should go into:

```text
Settings → Archive
```

Items can be restored.

Suggested configurable retention:

```text
30 Days
60 Days
90 Days
Permanent Archive
```

---

# 40. Settings Search

Universal Settings Search:

```text
Search Settings...
```

Results could include:

```text
Incident Severity — Field
DOT Driver Inspection — Form
Safety Manager — Role
Plant 4 — Location
Corrective Action Escalation — Automation
```

---

# 41. Settings Favorites

Admins should be able to favorite commonly used settings.

Example:

```text
★ Form Builder
★ Users
★ Locations
★ Training Rules
★ Notification Templates
```

---

# 42. Change Validation

Before publishing configuration changes, Forge runs a validation process.

Check for:

- Broken workflows
- Missing required fields
- Duplicate field keys
- Invalid formulas
- Missing permissions
- Broken automation
- Invalid references
- Orphaned fields
- Circular workflow
- Circular dependencies

---

# 43. Configuration Health

Settings Dashboard should display:

```text
Configuration Health: 96%

Forms: Healthy
Automations: Healthy
Permissions: 2 Warnings
Integrations: 1 Warning
Archived Fields: 14
Pending Drafts: 3
```

---

# 44. Settings Dashboard

Main Settings screen:

```text
Tenant Settings

Organization
24 Locations
88 Departments

Users
1,247 Active Users

Forms
138 Active Forms
4 Drafts

Automations
42 Active

Integrations
7 Connected

Configuration Health
96%

Recent Changes
---------------------------
Incident form updated
Training workflow changed
Plant 2 added
DOT notification changed
```

---

# 45. Settings Audit Log

Every settings action must be logged.

Capture:

```text
Tenant
User
Timestamp
IP Address
Action
Object
Previous Value
New Value
Configuration Version
Device
```

Examples:

```text
Created Field
Updated Form
Archived Dropdown
Changed Permission
Published Workflow
Disabled Module
Changed Notification
```

---

# 46. Immutable Compliance Audit

Audit records must not be editable by tenant administrators.

Authorized users may:

- View
- Search
- Filter
- Export

They cannot modify or erase the original audit history.

---

# 47. Feature Flags

Forge super administrators can control:

```text
Tenant Feature Enabled
Beta Feature
Experimental Feature
Module Access
Early Access
```

Tenant administrators may only see features Forge allows them to configure.

---

# 48. Tenant vs Forge Administration

## Forge Super Admin

Can control:

- Tenant creation
- Subscription
- Module licensing
- Global platform defaults
- Infrastructure settings
- System feature flags
- Tenant suspension
- Tenant configuration limits
- Global templates

## Tenant Admin

Can control:

- Tenant configuration
- Forms
- Fields
- Users
- Roles
- Workflow
- Locations
- Departments
- Branding
- Notifications
- Reports
- Automations

Tenant admins cannot change:

- Billing authorization
- Core platform security
- Infrastructure
- Global Forge code
- Other tenants
- Restricted compliance controls

---

# 49. Configuration Inheritance

Forge should support inherited configurations.

Example:

```text
Corporate
   ↓
Plant 1
   ↓
Maintenance Department
```

Plant 1 can inherit the corporate form while maintaining approved local overrides.

Display:

```text
Inherited from Corporate
```

or:

```text
Local Override
```

---

# 50. Configuration Locks

Corporate admins should be able to lock specific configuration.

Example:

```text
OSHA Incident Form
🔒 Corporate Controlled
```

Plant administrators cannot modify locked components.

---

# 51. Template Library

Forge should include a template library.

Examples:

- Incident Investigation
- Near Miss
- First Report of Injury
- Safety Observation
- JSA
- LOTO
- Confined Space
- Hot Work
- Forklift Inspection
- Vehicle Inspection
- Facility Inspection
- Emergency Drill
- Contractor Orientation

Admins can:

```text
Preview
Clone to Tenant
Customize
Publish
```

---

# 52. Tenant Template Library

Tenants can create their own templates.

Example:

```text
Producers Rice Mill Templates
```

Corporate administrators can deploy templates across multiple facilities.

---

# 53. Localization

Settings should support:

- Time zone
- Date format
- Time format
- Currency
- Imperial / metric
- Language
- Phone formatting
- Address formatting

---

# 54. API Settings

Authorized tenant administrators can configure:

- API keys
- API access scopes
- Webhooks
- Endpoint permissions
- API expiration
- Integration users
- Webhook secrets

Sensitive values must be encrypted.

---

# 55. Webhook Builder

Example:

```text
WHEN
Incident Closed

SEND
POST

TO
https://customer-system.example/webhook
```

Configure:

- Trigger
- Endpoint
- Authentication
- Payload
- Retry policy
- Logging

---

# 56. Integration Center

Display integrations as cards.

Example:

```text
HR / Payroll
ERP
AS400 / Infinium
Fleet Systems
Printers
Email
SMS
Identity Providers
External Training Systems
Custom API
```

Each integration should show:

```text
Connected
Disconnected
Needs Attention
Last Sync
Last Error
```

---

# 57. Environment Management

Enterprise tenants may eventually support:

```text
Sandbox
Production
```

Administrators can test changes in Sandbox before publishing them into Production.

---

# 58. Configuration Preview

Before publishing:

```text
Preview As:

Safety Manager
Supervisor
Employee
Contractor
Plant Administrator
```

This allows administrators to verify exactly what different users will see.

---

# 59. Mobile Preview

Form Builder should include:

```text
Desktop Preview
Tablet Preview
Mobile Preview
```

Since Forge is heavily field-oriented, mobile behavior should be considered a first-class configuration requirement.

---

# 60. Administrative Permission Levels

Recommended roles:

### Tenant Owner

Complete tenant control.

### Tenant Administrator

Broad configuration access.

### Configuration Administrator

Forms, fields, workflows, reports and automation.

### User Administrator

Users, departments and permissions.

### Module Administrator

Administration of assigned modules.

### Location Administrator

Configuration limited to assigned locations.

### Read-Only Administrator

Can review configuration without modifying it.

---

# 61. Settings Approval

Optional enterprise setting:

```text
Require Settings Change Approval
```

Example:

```text
Admin creates change
↓
Change submitted
↓
Corporate Admin approves
↓
Change published
```

---

# 62. Configuration Comments

Admins can leave comments on configuration drafts.

Example:

```text
Jeremy:
Added supervisor approval based on Plant 3 request.

Safety Director:
Approved. Publish Monday.
```

---

# 63. Global Save Behavior

Every settings page should provide:

```text
Save Draft
Publish
Cancel
Preview
Change History
```

Avoid silently saving high-impact administrative changes directly into production.

---

# 64. Universal Component Architecture

A major architectural requirement should be:

> Forge modules should consume configuration instead of hard-coded field definitions whenever possible.

Example:

Instead of programming:

```text
Incident Form has 24 fixed fields
```

Forge loads:

```text
Tenant
↓
Incident Record Type
↓
Form Configuration
↓
Sections
↓
Fields
↓
Conditional Rules
↓
Permissions
↓
Workflow
```

This allows the same Forge codebase to support highly different customers.

---

# 65. Suggested Core Configuration Objects

Backend objects should include concepts similar to:

```text
tenant_settings
tenant_features

config_forms
config_form_versions
config_form_sections

config_fields
config_field_versions
config_field_options

config_objects
config_object_relationships

config_workflows
config_workflow_states
config_workflow_transitions

config_automations
config_automation_triggers
config_automation_conditions
config_automation_actions

config_roles
config_permissions
config_field_permissions

config_navigation

config_dashboards
config_dashboard_widgets

config_reports

config_notifications
config_notification_templates

config_numbering_rules

config_branding

config_integrations

config_webhooks

config_retention_rules

config_templates

config_versions
config_change_log
```

Every table/object must include appropriate:

```text
tenant_id
created_at
created_by
updated_at
updated_by
status
version
```

---

# 66. Configuration API

The frontend should not rely on hard-coded tenant configuration.

Example:

```text
GET /api/config/forms/:formKey

GET /api/config/fields/:object

GET /api/config/workflows/:object

GET /api/config/navigation

GET /api/config/permissions

GET /api/config/branding
```

The platform renders the tenant experience based upon configuration returned by the configuration service.

---

# 67. Configuration Cache

Because these settings are read frequently, published configuration should be cached.

Example flow:

```text
Tenant publishes configuration
↓
Configuration validation
↓
Database update
↓
Configuration version created
↓
Cache invalidated
↓
New configuration cached
↓
Clients receive updated configuration
```

---

# 68. Safety Guardrails

Customization must never allow tenant admins to compromise:

- Tenant isolation
- Security
- Database integrity
- Required audit records
- Regulatory-required fields
- Historical records
- Subscription enforcement
- Forge infrastructure
- System authentication
- Core API protections

Some system fields should therefore display:

```text
SYSTEM FIELD
Cannot be deleted
```

But admins may still be allowed to:

- Rename display label
- Move field
- Change help text
- Control visibility where permitted

---

# 69. Administrative Warnings

High-impact actions should clearly explain consequences.

Example:

```text
ARCHIVE FIELD?

"Employee Injury Type" is currently used by:

3 Active Forms
2 Reports
4 Automation Rules
18,422 Records

Archiving this field will remove it from future data entry but will not remove historical data.
```

---

# 70. Platform Philosophy

Forge Industrial Safety should follow this principle:

> **Configure first. Customize through code only when necessary.**

A tenant administrator should be able to configure most business processes directly from Settings without contacting Forge support.

The system should support a customer saying:

> "That isn't how our company does it."

and allow Forge to respond:

> "Your administrator can configure that."

instead of:

> "We need to change the software."

---

# 71. End Goal

The completed Settings system transforms Forge Industrial Safety from a modular safety application into a true configurable SaaS platform.

A properly authorized administrator should be able to control:

**WHAT** information Forge collects.

**WHERE** it appears.

**WHO** can access it.

**WHEN** it is required.

**HOW** it moves through the organization.

**WHAT** happens when something changes.

**WHO** is notified.

**HOW** the information is reported.

**HOW** the tenant looks.

**HOW** Forge integrates with the customer's existing systems.

All of this must remain protected by:

- Tenant isolation
- Version control
- Permission controls
- Dependency protection
- Audit logging
- Soft deletion
- Historical preservation
- Configuration validation
- Forge-controlled system guardrails

This should become the foundation of the entire Forge Industrial Safety multi-tenant architecture.