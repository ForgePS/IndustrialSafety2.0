# Forge Industrial Safety — Complete Reporting System Specification

## Document Purpose

This document defines the complete Reporting system for Forge Industrial Safety.

The current Reporting page must be replaced with a full tenant-aware reporting platform that allows authorized users to:

- Run standard reports
- Build custom reports
- Filter and group data
- Create charts and analytics
- Save reports
- Schedule reports
- Export reports
- Share reports
- Generate compliance packages
- Review report execution history
- Report across multiple Forge modules
- Use tenant-created custom fields in reports
- Enforce tenant, location, department, role, and sensitive-data permissions

The Reporting system must function as a shared platform service used by every enabled Forge Industrial Safety module.

---

# 1. Primary Route

```text
/reporting
```

Recommended child routes:

```text
/reporting
/reporting/library
/reporting/builder
/reporting/saved
/reporting/scheduled
/reporting/compliance
/reporting/analytics
/reporting/exports
/reporting/history
/reporting/templates
/reporting/settings
```

---

# 2. Reporting Main Navigation

Create a Reporting section with the following navigation:

```text
Overview
Report Library
Custom Report Builder
Saved Reports
Scheduled Reports
Compliance Reports
Analytics Reports
Exports
Report History
Templates
Settings
```

Only show menu items the current user has permission to access.

---

# 3. Reporting Overview Page

Replace the existing empty Reporting table with a full Reporting Center.

## Header

```text
Reporting

Build, analyze, schedule, export, and manage reports across your organization.
```

Primary actions:

```text
+ Create Report
Report Library
Scheduled Reports
```

Secondary actions:

```text
Saved Reports
Compliance Reports
Exports
```

---

# 4. Reporting Overview KPI Cards

Display:

```text
Saved Reports
Scheduled Reports
Reports Run This Month
Pending Scheduled Reports
Recent Exports
Compliance Reports
```

Example:

```text
┌─────────────────┐
│ Saved Reports   │
│      28         │
└─────────────────┘

┌─────────────────┐
│ Scheduled       │
│      12         │
└─────────────────┘

┌─────────────────┐
│ Runs This Month │
│      174        │
└─────────────────┘

┌─────────────────┐
│ Compliance      │
│      14         │
└─────────────────┘
```

Cards must be clickable and route to the associated filtered page.

---

# 5. Reporting Overview Sections

Include:

## Favorites

Show user-favorited reports.

```text
★ Monthly Safety Summary
★ Training Compliance
★ DOT Compliance
★ Open Corrective Actions
```

## Recently Run

Show recently executed reports.

Columns:

```text
Report
Module
Run By
Run Date
Records
Status
Action
```

## Scheduled Reports

Show upcoming scheduled reports.

Columns:

```text
Report
Frequency
Next Run
Recipients
Format
Status
Action
```

## Report Library Preview

Show commonly used built-in reports.

---

# 6. Report Library

Route:

```text
/reporting/library
```

The Report Library contains Forge-provided reports and tenant-created report templates.

Columns:

```text
Report Name
Module
Category
Description
Owner
Last Run
Schedule
Status
Actions
```

Actions:

```text
Run
View
Edit Filters
Schedule
Export
Duplicate
Save As
Share
Favorite
```

---

# 7. Report Library Search and Filters

Search:

```text
Search reports...
```

Search across:

```text
Report Name
Description
Module
Category
Owner
Tags
```

Filters:

```text
Module
Category
Report Type
Owner
Visibility
Scheduled
Favorite
Created Date
Last Run
Status
```

Sorting:

```text
Name
Recently Created
Recently Updated
Recently Run
Most Used
Module
Owner
```

---

# 8. Report Categories

Reports must be grouped into logical categories.

```text
Safety
Incidents
Inspections
Training
Personnel
DOT
Fleet
Equipment
Inventory
JSAs
Observations
Corrective Actions
Compliance
Emergency Response
Permits
Contractors
Environmental
Manufacturing
Warehouse
Analytics
Administration
```

Only show categories for modules enabled for the tenant.

---

# 9. Standard Safety Reports

Provide built-in reports:

```text
Safety Performance Summary
Safety KPI Report
Incident Frequency Report
Incident Severity Report
Incident Trend Report
Near Miss Report
Lost Time Incident Report
Recordable Incident Report
First Aid Incident Report
Safety Observation Report
Unsafe Act Report
Unsafe Condition Report
Safety Concern Report
Corrective Action Report
Corrective Action Aging Report
Overdue Corrective Actions
Safety Inspection Performance
Department Safety Performance
Location Safety Performance
Employee Safety Activity
Supervisor Safety Performance
Monthly Safety Summary
Quarterly Safety Summary
Annual Safety Summary
```

---

# 10. Incident Reports

Built-in reports:

```text
All Incidents
Open Incidents
Closed Incidents
Incident Investigation Status
Incidents by Type
Incidents by Location
Incidents by Department
Incidents by Shift
Incidents by Employee
Incidents by Supervisor
Incidents by Date
Incidents by Time
Incidents by Severity
Incident Injury Report
Body Part Injury Analysis
Nature of Injury Analysis
Cause of Injury Analysis
Root Cause Analysis
Contributing Factors
Days Away From Work
Restricted Duty Cases
Lost Workday Report
Property Damage Report
Vehicle Incident Report
Near Miss Analysis
Witness Report
Incident Cost Analysis
Repeat Incident Analysis
```

---

# 11. OSHA and Compliance Reports

Provide:

```text
OSHA Recordable Incident Summary
OSHA 300 Data
OSHA 300A Summary Data
OSHA 301 Incident Detail
TRIR
DART
LTIR
Severity Rate
Days Away
Restricted / Transfer Days
Recordable Cases
Non-Recordable Cases
Fatality Reporting
Annual Safety Statistics
OSHA Inspection Readiness Report
Compliance Deficiency Report
Compliance Corrective Actions
```

Compliance calculations must use configurable, version-controlled compliance logic.

Do not hard-code compliance interpretations directly into front-end components.

---

# 12. DOT Reports

DOT must be a full reporting category.

Built-in reports:

```text
DOT Driver Roster
Driver Qualification Status
Driver Qualification Expiration
CDL Expiration
Medical Card Expiration
MVR Review Status
Driver Training Status
DOT Drug & Alcohol Compliance
Random Testing Status
Post-Accident Testing
Reasonable Suspicion Testing
Return-to-Duty Status
Driver Violations
Driver Incidents
DOT Vehicle Inspection Report
DVIR Summary
Failed DVIR Items
DOT Corrective Actions
Vehicle Maintenance Compliance
Annual DOT Compliance Report
DOT Audit Readiness Report
```

DOT report filters:

```text
Driver
Vehicle
Department
Location
CDL Class
License State
Compliance Status
Expiration Range
Date Range
Supervisor
```

---

# 13. Training Reports

Provide:

```text
Training Completion
Training Compliance
Training Matrix
Employee Training Transcript
Department Training Status
Assigned Training
Completed Training
Incomplete Training
Overdue Training
Upcoming Training
Failed Training
Retest Report
Certification Status
Certification Expiration
Certification Renewal
Course Completion
Course Attendance
Course Scores
Average Course Score
Quiz/Test Performance
Training Hours
Training Hours by Employee
Training Hours by Department
Training Hours by Course
Instructor Activity
Training Effectiveness
Training Compliance Percentage
New Hire Training
Orientation Completion
Annual Required Training
```

---

# 14. Personnel Reports

Provide:

```text
Employee Roster
Active Employees
Inactive Employees
Department Roster
Location Roster
Supervisor Roster
Employee Compliance Status
Employee Certifications
Certification Expirations
Employee Training Status
Employee Safety Activity
Employee Incident History
Employee Inspection Activity
Employee Corrective Actions
New Hire Status
Orientation Status
Employment Status
```

Sensitive personnel reports must require elevated permissions.

---

# 15. Inspection Reports

Provide:

```text
Inspection Summary
Completed Inspections
Pending Inspections
Overdue Inspections
Failed Inspections
Inspection Findings
Inspection Deficiencies
Inspection Score
Inspection Trends
Inspection by Location
Inspection by Department
Inspection by Inspector
Inspection by Equipment
Repeat Deficiencies
Corrective Actions Generated
Inspection Compliance Rate
Daily Inspection Summary
Weekly Inspection Summary
Monthly Inspection Summary
```

---

# 16. Corrective Action Reports

Provide:

```text
All Corrective Actions
Open Corrective Actions
Closed Corrective Actions
Overdue Corrective Actions
Critical Corrective Actions
Corrective Actions by Department
Corrective Actions by Location
Corrective Actions by Owner
Corrective Actions by Source
Corrective Action Aging
Average Closure Time
Repeat Corrective Actions
Verification Pending
Verified Corrective Actions
```

Supported source types:

```text
Incident
Inspection
Observation
JSA
Audit
DOT
Fleet
Equipment
Environmental
LOTO
Confined Space
Hot Work
Machine Safety
```

---

# 17. Fleet Reports

Provide:

```text
Fleet Roster
Vehicle Status
Assigned Vehicles
Vehicle Mileage
Mileage History
Vehicle Utilization
Vehicle Inspections
Vehicle Maintenance
Preventive Maintenance
Upcoming Maintenance
Overdue Maintenance
Vehicle Repairs
Vehicle Downtime
Vehicle Costs
Fuel Usage
Vehicle Registration Expiration
Insurance Expiration
License Plate Renewal
Vehicle Incident History
Vehicle Safety Deficiencies
```

---

# 18. Equipment and Asset Reports

Provide:

```text
Equipment Inventory
Equipment by Location
Equipment by Department
Equipment Assignment
Equipment Condition
Equipment Inspection
Equipment Maintenance
Equipment Service History
Equipment Out of Service
Equipment Calibration
Calibration Expiration
Equipment Certification
Equipment Replacement
Equipment Age
Equipment Cost
QR Scan Activity
Asset History
```

---

# 19. Safety Supply Inventory Reports

Provide:

```text
Inventory On Hand
Low Stock
Out of Stock
Reorder Report
Inventory by Location
Inventory by Department
Inventory Usage
Inventory Issuance
Employee Issue History
Inventory Transfers
Inventory Adjustments
Expired Inventory
Expiring Inventory
Inventory Cost
Purchase History
Vendor History
Inventory Variance
Cycle Count
Physical Inventory
```

---

# 20. JSA Reports

Provide:

```text
Active JSAs
Expired JSAs
JSA Review Due
JSA Approvals
JSA by Department
JSA by Location
JSA by Job
Hazards Identified
Controls Identified
JSA Employee Acknowledgment
Missing Acknowledgments
JSA Revision History
JSA Compliance
```

---

# 21. Observation Reports

Provide:

```text
Safety Observations
Positive Observations
Unsafe Acts
Unsafe Conditions
Observation Trends
Observation by Department
Observation by Location
Observation by Employee
Observation by Supervisor
Observation Category
Observation Corrective Actions
Observation Closure Rate
Repeat Observations
```

---

# 22. Hot Work Reports

Provide:

```text
Hot Work Permits Issued
Active Hot Work Permits
Expired Hot Work Permits
Hot Work Permit Compliance
Fire Watch Assignments
Hot Work Locations
Hot Work Violations
Hot Work Corrective Actions
```

---

# 23. Confined Space Reports

Provide:

```text
Confined Space Entries
Entry Permits
Active Entries
Completed Entries
Entry Duration
Authorized Entrants
Attendants
Entry Supervisors
Atmospheric Testing
Rescue Requirements
Permit Violations
Confined Space Corrective Actions
```

---

# 24. LOTO Reports

Provide:

```text
LOTO Activity
LOTO Procedures
Active Lockouts
Completed Lockouts
Authorized Employees
Affected Employees
Machine-Specific LOTO
LOTO Inspections
Annual LOTO Review
LOTO Violations
LOTO Corrective Actions
```

---

# 25. Contractor Reports

Provide:

```text
Contractor Roster
Approved Contractors
Contractor Safety Status
Insurance Expiration
Certification Expiration
Contractor Training
Contractor Orientation
Contractor Incidents
Contractor Violations
Contractor Corrective Actions
Contractor Compliance Score
```

---

# 26. Emergency Response Reports

Provide:

```text
Emergency Response Team Roster
ERT Training Status
ERT Certification Status
Emergency Drill Report
Drill Participation
Drill Performance
Emergency Equipment Inspection
Emergency Equipment Readiness
Emergency Response Plan Review
Emergency Contact Verification
After Action Reports
Emergency Corrective Actions
```

---

# 27. Environmental Reports

Provide:

```text
Environmental Incident Report
Environmental Inspection Report
Spill Report
Waste Tracking Report
Environmental Corrective Actions
Permit Compliance
Environmental Training Compliance
Environmental Audit Findings
Environmental KPI Summary
```

---

# 28. Custom Report Builder

Route:

```text
/reporting/builder
```

Button:

```text
+ Create Report
```

Launch a wizard:

```text
1. Data Source
2. Fields
3. Filters
4. Grouping
5. Calculations
6. Visualization
7. Preview
8. Save & Schedule
```

---

# 29. Step 1 — Select Data Source

Available datasets may include:

```text
Incidents
Employees
Training Records
Training Assignments
Certifications
Inspections
Corrective Actions
Fleet
DOT Drivers
DOT Vehicles
Equipment
Inventory
JSAs
Observations
Hot Work
Confined Space
LOTO
Contractors
Emergency Response
Environmental
```

Only show datasets from enabled modules.

---

# 30. Step 2 — Select Fields

Users choose report columns.

Example:

```text
☑ Employee Name
☑ Employee Number
☑ Department
☑ Location
☑ Incident Date
☑ Incident Type
☑ Severity
☑ Recordable
☑ Corrective Action Status
```

Support:

```text
Drag to reorder
Hide/show
Custom column label
Column width
Sort order
Grouping
Totals
Subtotals
```

---

# 31. Step 3 — Filters

Supported operators:

```text
Equals
Does Not Equal
Contains
Does Not Contain
Starts With
Ends With
Greater Than
Less Than
Greater Than or Equal
Less Than or Equal
Between
Before
After
Is Empty
Is Not Empty
Is True
Is False
Is Any Of
Is None Of
```

Example:

```text
Location = Stuttgart Plant

AND

Incident Date = Last 12 Months

AND

Recordable = Yes

AND

Department IN Production, Maintenance
```

Support nested AND/OR filter groups.

Example:

```text
Location = Stuttgart

AND

(
    Department = Production
    OR
    Department = Maintenance
)
```

---

# 32. Relative Date Filters

Support:

```text
Today
Yesterday
This Week
Last Week
This Month
Last Month
This Quarter
Last Quarter
This Year
Last Year
Last 7 Days
Last 30 Days
Last 60 Days
Last 90 Days
Last 180 Days
Last 365 Days
Month to Date
Quarter to Date
Year to Date
Custom Range
```

Relative dates must be recalculated at report runtime.

---

# 33. Step 4 — Grouping

Supported grouping examples:

```text
Location
Department
Employee
Supervisor
Incident Type
Severity
Month
Quarter
Year
Equipment
Vehicle
Course
Status
Category
```

Nested grouping must be supported.

Example:

```text
Location
    Department
        Incident Type
```

---

# 34. Step 5 — Calculations

Supported calculations:

```text
Count
Distinct Count
Sum
Average
Minimum
Maximum
Percentage
Rate
Median
```

Compliance calculations:

```text
TRIR
DART
LTIR
Completion %
Pass %
Failure %
Inspection Compliance %
Corrective Action Closure %
Training Compliance %
```

---

# 35. Step 6 — Visualizations

Supported chart types:

```text
Bar
Horizontal Bar
Line
Area
Pie
Donut
Stacked Bar
Trend
KPI
Gauge
Heatmap
```

Visualization configuration:

```text
Title
Subtitle
Metric
Category
Grouping
Date Interval
Legend
Labels
Display Values
```

Charts must respect the same tenant and permission rules as the underlying report.

---

# 36. Step 7 — Report Preview

Provide live server-side preview.

Display:

```text
Records: 248
Showing: 1–50
```

Support:

```text
Pagination
Sorting
Filtering
Column resize
Column reorder
Group expansion
```

Do not load unbounded data into the browser.

Recommended default preview limit:

```text
100 records
```

---

# 37. Step 8 — Save and Schedule

Save fields:

```text
Report Name
Description
Category
Tags
Visibility
Owner
Favorite
```

Visibility options:

```text
Private
Department
Location
Organization
```

Actions:

```text
Save
Save & Run
Save & Schedule
Save as Template
Cancel
```

---

# 38. Saved Reports

Route:

```text
/reporting/saved
```

Columns:

```text
Report Name
Description
Owner
Category
Visibility
Created
Modified
Last Run
Run Count
Actions
```

Actions:

```text
Run
Edit
Duplicate
Schedule
Export
Share
Favorite
Delete
```

---

# 39. Scheduled Reports

Route:

```text
/reporting/scheduled
```

Supported schedules:

```text
Daily
Weekly
Monthly
Quarterly
Annually
Custom
```

Schedule fields:

```text
Report
Frequency
Day
Time
Time Zone
Reporting Period
Recipients
Delivery Method
Export Format
Enabled
Start Date
End Date
```

Example:

```text
Report: Monthly Safety Summary

Frequency: Monthly
Run: 1st day of month
Time: 7:00 AM
Period: Previous Month
Format: PDF

Recipients:
- Safety Manager
- Plant Manager
- Corporate EHS
```

---

# 40. Report Delivery

Supported delivery methods:

```text
Email
Forge Notification
Download Center
```

Future-ready:

```text
SFTP
API
SharePoint
External Storage
Webhook
```

Recipient types:

```text
Individual User
Role
Department
Location
Email Address
Distribution Group
```

---

# 41. Conditional Scheduled Reports

Allow scheduled reports to deliver only when a condition exists.

Example:

```text
Report:
DOT Medical Card Expiration

Condition:
Expiration within 30 days

Schedule:
Daily
```

Example:

```text
Report:
Overdue Corrective Actions

Condition:
Record Count > 0

Schedule:
Every Monday
```

Supported delivery conditions:

```text
Always Deliver
Record Count > 0
Record Count = 0
Record Count Above Threshold
Record Count Below Threshold
Metric Above Threshold
Metric Below Threshold
```

---

# 42. Compliance Reports

Route:

```text
/reporting/compliance
```

Sections:

```text
OSHA
DOT
Training
Inspections
Corrective Actions
Environmental
Permits
Contractor Compliance
Emergency Response
```

Provide one-click compliance packages.

---

# 43. Compliance Report Packages

Example package:

## Monthly Safety Package

```text
Executive Safety Summary
Incident Summary
Recordable Incidents
Near Misses
Inspection Summary
Corrective Actions
Training Compliance
DOT Compliance
Fleet Compliance
```

Action:

```text
Generate Monthly Safety Package
```

Generate:

```text
Single Combined PDF
Optional ZIP of Individual Reports
```

---

# 44. Executive Reporting

Provide executive templates:

```text
Executive Safety Dashboard
Corporate Safety Summary
Multi-Site Comparison
Location Performance
Department Performance
Safety KPI Summary
Incident Trend
Compliance Score
Training Compliance
Corrective Action Aging
DOT Compliance Summary
Fleet Compliance Summary
```

Executive reports should focus on summarized metrics and trends instead of raw records.

---

# 45. Multi-Location Reporting

Support:

```text
All Locations
Single Location
Multiple Locations
Region
Division
Organization
```

Access must be restricted to authorized locations.

Example hierarchy:

```text
Corporate
├── Arkansas
│   ├── Stuttgart
│   └── Pine Bluff
└── Mississippi
    ├── North Mississippi
    └── Delta Facility
```

A location-restricted admin must never gain access to another location through Reporting.

---

# 46. Drill-Down

Report metrics and charts should support drill-down when appropriate.

Example:

```text
Overdue Corrective Actions
17
```

Clicking `17` opens:

```text
Corrective Action
Source
Department
Responsible Person
Due Date
Days Overdue
Priority
Status
```

Drill-down must retain original filters and permission scope.

---

# 47. Report Sharing

Reports can be shared with:

```text
User
Role
Department
Location
Organization
```

Share permissions:

```text
View
Run
Edit
Duplicate
Schedule
Export
Manage
```

Users cannot grant permissions they do not possess.

---

# 48. Favorites

Users can favorite reports.

Example:

```text
★ Monthly Safety Summary
★ DOT Expirations
★ Overdue Training
★ Open Corrective Actions
```

Favorites appear on the Reporting Overview.

---

# 49. Report Templates

Route:

```text
/reporting/templates
```

Template types:

```text
Forge Standard Template
Tenant Template
Personal Template
```

Forge Standard Templates:

- Cannot be deleted by tenant users
- Can be duplicated
- Can allow tenant-specific filter defaults
- Can receive version updates

Tenant Templates:

- Created by authorized tenant admins
- Shared according to scope

---

# 50. Export Center

Route:

```text
/reporting/exports
```

Columns:

```text
Export
Report
Requested By
Requested At
Records
Format
Status
Expires
Action
```

Statuses:

```text
Queued
Processing
Completed
Failed
Expired
Cancelled
```

Actions:

```text
Download
Retry
Delete
View Report
```

---

# 51. Supported Export Formats

Required:

```text
PDF
XLSX
CSV
Print
```

Optional:

```text
JSON
```

PDF settings:

```text
Company Logo
Report Title
Report Description
Reporting Period
Generated Date
Generated By
Page Numbers
Confidentiality Footer
Location
Department
Applied Filters
```

---

# 52. Export Security

Exported files must inherit the report's data permissions.

Never include hidden or unauthorized fields in an export.

Sensitive exports should optionally support:

```text
Confidential Watermark
Expiration
Download Audit
Restricted Download
```

---

# 53. Report History

Route:

```text
/reporting/history
```

Columns:

```text
Report
User
Started
Completed
Status
Records
Duration
Export Type
Source
```

Status:

```text
Queued
Processing
Completed
Failed
Cancelled
```

Source examples:

```text
Manual
Schedule
Compliance Package
API
System
```

---

# 54. Reporting Settings

Route:

```text
/reporting/settings
```

Tenant administrator options:

```text
Company Report Logo
Report Header
Report Footer
Default Paper Size
Default Orientation
Default Export Type
Default Date Format
Default Time Zone
Default Reporting Period
Confidentiality Statement
Default Retention Period
Export Expiration
Scheduled Report Defaults
```

---

# 55. Reporting Permission Model

Create granular permissions:

```text
reporting.view
reporting.run
reporting.create
reporting.edit
reporting.delete
reporting.export
reporting.schedule
reporting.share
reporting.manage
reporting.view_sensitive
reporting.manage_templates
reporting.manage_datasets
reporting.admin
```

Reporting permissions must be additive to module permissions.

Example:

A user with:

```text
reporting.view
```

but without:

```text
personnel.view_sensitive
```

cannot use Reporting to expose restricted Personnel information.

---

# 56. Tenant Isolation

Every report execution must enforce:

```text
tenant_id = authenticated_user.tenant_id
```

before any user-defined filters are applied.

Also enforce:

```text
Location Access
Department Access
Role Access
Record-Level Restrictions
Module Access
Sensitive Data Access
```

Never accept a client-supplied tenant ID as the authority for report scope.

---

# 57. Sensitive Fields

Reporting dataset fields must support a sensitive-data flag.

Examples:

```text
Medical Information
Workers Compensation
Employee Personal Information
Drug / Alcohol Testing
Driver Records
Restricted Investigation Data
Sensitive HR Information
```

Sensitive fields require dedicated permissions.

---

# 58. Reporting Dataset Registry

Create a central registry of reportable datasets.

Example datasets:

```text
incidents
employees
training_records
training_assignments
certifications
inspections
corrective_actions
fleet
dot_drivers
dot_vehicles
equipment
inventory
jsas
observations
hot_work
confined_space
loto
contractors
emergency_response
environmental
```

Each dataset defines:

```text
Dataset ID
Module
Display Name
Description
Enabled
Allowed Fields
Allowed Filters
Allowed Sorts
Allowed Grouping
Allowed Aggregations
Relationships
Sensitive Fields
Required Permissions
Tenant Scope
```

---

# 59. Reporting Field Registry

Each reportable field should define:

```text
Field Key
Display Label
Data Type
Description
Reportable
Filterable
Sortable
Groupable
Aggregatable
Sensitive
Exportable
Required Permission
Formatting Rules
```

Example:

```text
Field: production_line

Label: Production Line

Type: string

Reportable: Yes
Filterable: Yes
Sortable: Yes
Groupable: Yes
Aggregatable: No
Sensitive: No
Exportable: Yes
```

---

# 60. Tenant Custom Fields

Tenant-created fields from the Forge configurable forms/settings engine must be available in Reporting when marked:

```text
Reportable = Yes
```

Example custom fields:

```text
Employee → Badge Number
Incident → Production Line
Equipment → Asset Classification
Inspection → Building Area
```

Custom fields must support:

```text
Reportable
Filterable
Sortable
Groupable
Aggregatable
Sensitive
Exportable
```

The Reporting system must automatically discover approved tenant custom fields instead of requiring code changes for every new field.

---

# 61. Cross-Module Reporting

Allow approved relationships between datasets.

Examples:

```text
Employee
→ Training
→ Incident
→ Corrective Action
```

```text
Equipment
→ Inspection
→ Corrective Action
```

```text
Driver
→ Vehicle
→ DVIR
→ Maintenance
```

Users must never create arbitrary database joins.

Relationships must come from the Reporting Dataset Registry.

---

# 62. Cross-Module Report Examples

Support reports such as:

```text
Employees involved in incidents who have overdue training
```

```text
Equipment with failed inspections and open corrective actions
```

```text
Drivers with expiring credentials and assigned fleet vehicles
```

```text
Departments with high incident rates and low training compliance
```

```text
Locations with repeat inspection deficiencies
```

---

# 63. Server-Side Reporting Architecture

Do not expose raw SQL to the client.

Architecture:

```text
Report Definition
      ↓
Permission Validator
      ↓
Tenant Scope
      ↓
Dataset Registry
      ↓
Safe Query Builder
      ↓
Database
      ↓
Result Processor
      ↓
Report Renderer
      ↓
Export / Response
```

Never accept:

```json
{
  "sql": "SELECT * FROM incidents"
}
```

Accept structured definitions:

```json
{
  "dataset": "incidents",
  "fields": ["incident_number", "incident_date", "department", "severity"],
  "filters": [
    {
      "field": "incident_date",
      "operator": "last_30_days"
    }
  ]
}
```

The backend converts this definition into authorized, parameterized queries.

---

# 64. Report Definition Model

Example:

```ts
interface ReportDefinition {
  id: string;
  tenantId: string;

  name: string;
  description?: string;

  category: string;
  dataset: string;

  columns: ReportColumn[];
  filters: ReportFilter[];
  groups: ReportGroup[];
  sorts: ReportSort[];
  calculations: ReportCalculation[];

  visualization?: ReportVisualization;

  visibility: "private" | "department" | "location" | "tenant";

  ownerId: string;

  createdAt: string;
  updatedAt: string;
}
```

---

# 65. Recommended Database Tables

Create or adapt the following:

```text
report_definitions
report_templates
report_datasets
report_dataset_fields
report_dataset_relationships
report_columns
report_filters
report_groups
report_sorts
report_calculations
report_visualizations
report_schedules
report_recipients
report_executions
report_exports
report_shares
report_favorites
report_audit_logs
```

Common columns where applicable:

```text
id
tenant_id
created_at
updated_at
created_by
updated_by
deleted_at
```

---

# 66. Suggested report_definitions Table

```text
id
tenant_id
name
description
category
dataset_key
visibility
owner_id
is_template
is_forge_template
is_active
definition_json
created_at
updated_at
created_by
updated_by
deleted_at
```

---

# 67. Suggested report_schedules Table

```text
id
tenant_id
report_id
name
frequency
cron_expression
timezone
reporting_period
export_format
delivery_method
condition_type
condition_value
enabled
start_at
end_at
next_run_at
last_run_at
created_at
updated_at
created_by
updated_by
```

---

# 68. Suggested report_recipients Table

```text
id
tenant_id
schedule_id
recipient_type
user_id
role_id
department_id
location_id
email_address
distribution_group_id
created_at
```

---

# 69. Suggested report_executions Table

```text
id
tenant_id
report_id
schedule_id
requested_by
source
status
started_at
completed_at
record_count
duration_ms
error_code
error_message
filters_snapshot
definition_snapshot
created_at
```

---

# 70. Suggested report_exports Table

```text
id
tenant_id
execution_id
format
storage_key
file_name
file_size
status
expires_at
created_at
created_by
```

---

# 71. Suggested report_favorites Table

```text
id
tenant_id
user_id
report_id
created_at
```

Unique:

```text
tenant_id + user_id + report_id
```

---

# 72. Suggested report_shares Table

```text
id
tenant_id
report_id
share_type
user_id
role_id
department_id
location_id
can_view
can_run
can_edit
can_duplicate
can_schedule
can_export
can_manage
created_at
created_by
```

---

# 73. Report Execution Architecture

Small preview reports may be synchronous.

Large reports and exports must use background processing.

Flow:

```text
User Requests Report
        ↓
API Validates Permissions
        ↓
Execution Record Created
        ↓
Queue
        ↓
Reporting Worker
        ↓
Safe Query Builder
        ↓
Database
        ↓
Result Processor
        ↓
Renderer
        ↓
Object Storage
        ↓
Download / Notification
```

---

# 74. Performance Requirements

Required:

```text
Server-side filtering
Server-side sorting
Server-side pagination
Server-side grouping
Server-side aggregation
Query timeout
Execution timeout
Preview row limit
Export row limit
Job queue
Progress status
Cancellation
```

Recommended:

```text
Preview Default: 100 rows
Page Size: 25 / 50 / 100
```

Never fetch entire large datasets into the browser for client-side filtering.

---

# 75. Caching

Optional reporting cache may be used for:

```text
Expensive executive reports
Large trend calculations
Compliance summaries
Multi-location dashboards
```

Cache keys must include:

```text
Tenant
Report
Filters
Permission Scope
Data Version / Expiration
```

Never share cached report results across tenants.

---

# 76. Audit Logging

Audit the following:

```text
Report Created
Report Modified
Report Deleted
Report Viewed
Report Run
Report Exported
Report Shared
Report Schedule Created
Report Schedule Modified
Report Schedule Deleted
Sensitive Data Accessed
Template Created
Template Modified
```

Audit details:

```text
Tenant
User
Date / Time
IP Address
Report
Operation
Record Count
Export Type
Schedule
Sensitive Data Access
```

---

# 77. Module Registration Architecture

Every Forge module must register reporting metadata.

Example:

```ts
registerReportingDataset({
  module: "dot",
  dataset: "dot_drivers",
  label: "DOT Drivers",
  permissions: ["dot.view"],
  fields: [],
  relationships: [],
});
```

Each module should register:

```text
Datasets
Fields
Filters
Metrics
Calculations
Templates
Permissions
Relationships
```

This allows Reporting to grow automatically as Forge modules are added.

---

# 78. Reporting API

Recommended API structure:

```text
GET    /api/reporting/overview

GET    /api/reporting/datasets
GET    /api/reporting/datasets/:id

GET    /api/reporting/templates
GET    /api/reporting/templates/:id

GET    /api/reporting/reports
POST   /api/reporting/reports
GET    /api/reporting/reports/:id
PATCH  /api/reporting/reports/:id
DELETE /api/reporting/reports/:id

POST   /api/reporting/reports/:id/preview
POST   /api/reporting/reports/:id/run
POST   /api/reporting/reports/:id/export
POST   /api/reporting/reports/:id/duplicate

POST   /api/reporting/reports/:id/favorite
DELETE /api/reporting/reports/:id/favorite

POST   /api/reporting/reports/:id/share
DELETE /api/reporting/reports/:id/share/:shareId

GET    /api/reporting/schedules
POST   /api/reporting/schedules
GET    /api/reporting/schedules/:id
PATCH  /api/reporting/schedules/:id
DELETE /api/reporting/schedules/:id

GET    /api/reporting/history
GET    /api/reporting/executions/:id

GET    /api/reporting/exports
GET    /api/reporting/exports/:id
DELETE /api/reporting/exports/:id

GET    /api/reporting/settings
PATCH  /api/reporting/settings
```

---

# 79. API Security Rules

Every endpoint must enforce:

```text
Authentication
Tenant membership
Module access
Reporting permission
Location scope
Department scope
Record scope
Sensitive field permissions
```

Never trust:

```text
tenant_id
user_id
role
permissions
```

sent from the browser as authorization authority.

These values must come from the authenticated server-side security context.

---

# 80. Reporting UI Components

Create reusable components:

```text
ReportingHeader
ReportingNavigation
ReportingKpiCard
ReportLibraryTable
ReportSearch
ReportFilterBar
ReportFavoriteButton
ReportRunButton
ReportExportMenu
ReportScheduleDialog
ReportShareDialog
ReportBuilderWizard
DatasetSelector
FieldSelector
FilterBuilder
GroupingBuilder
CalculationBuilder
VisualizationBuilder
ReportPreview
ReportTable
ReportChart
ReportExecutionStatus
ReportHistoryTable
ExportCenterTable
ScheduledReportTable
CompliancePackageCard
```

---

# 81. Report Table Requirements

Report table must support:

```text
Pagination
Server-side sorting
Server-side filtering
Column visibility
Column reorder
Column resize
Sticky headers
Grouping
Totals
Subtotals
Search
Export
Responsive layout
```

On mobile:

- Do not force the entire desktop table width
- Allow horizontal scrolling when needed
- Prioritize key columns
- Provide card/detail mode where appropriate

---

# 82. Error States

Provide clear user-facing errors.

Examples:

```text
You do not have permission to run this report.
```

```text
This report contains fields you no longer have access to.
```

```text
The report could not be completed. Please try again.
```

```text
This report contains a field that is no longer available.
```

```text
No records matched the selected filters.
```

Do not expose SQL, database messages, stack traces, or internal service errors.

---

# 83. Empty States

Example:

```text
No saved reports yet.

Create a custom report or save one from the Report Library.

[ Create Report ]
```

Example:

```text
No scheduled reports.

Schedule a report to automatically generate and deliver recurring reports.

[ Schedule Report ]
```

---

# 84. Loading States

Use:

```text
Skeleton loaders
Progress bars
Execution status
Export status
```

For long-running reports:

```text
Preparing report...
```

then:

```text
Your report is being generated. You can leave this page and return later.
```

---

# 85. Report Status

Supported report lifecycle status:

```text
Draft
Active
Archived
```

Execution status:

```text
Queued
Processing
Completed
Failed
Cancelled
```

Schedule status:

```text
Active
Paused
Expired
Failed
```

---

# 86. Reporting Overview Suggested Layout

```text
REPORTING

Reports & Analytics

Build, analyze, schedule, and export reports across Forge.

[ + Create Report ] [ Report Library ] [ Scheduled Reports ]

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Saved        │ │ Scheduled    │ │ This Month   │ │ Compliance   │
│ Reports      │ │ Reports      │ │ Report Runs  │ │ Reports      │
│    28        │ │     12       │ │    174       │ │     14       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

Favorites
─────────────────────────────────────────────────────────────

★ Monthly Safety Summary
★ Training Compliance
★ DOT Compliance
★ Open Corrective Actions


Report Library
─────────────────────────────────────────────────────────────

[ Search reports... ] [ Module ▼ ] [ Category ▼ ] [ More Filters ]

REPORT                 MODULE       DESCRIPTION        LAST RUN       ACTION

Monthly Safety         Safety       Monthly KPI...     Sep 1          Run
Training Compliance    Training     Employee...        Today          Run
DOT Expirations        DOT          Upcoming...        Yesterday      Run
Incident Trends        Incidents    Incident...        Aug 30         Run
Fleet Maintenance      Fleet        Vehicle...         Aug 29         Run


Recent Reports
─────────────────────────────────────────────────────────────


Scheduled Reports
─────────────────────────────────────────────────────────────
```

---

# 87. Remove Current Developer-Facing Message

Remove this from the customer-facing UI:

```text
Server-side report adapters never accept raw SQL.
```

The rule remains valid technically but belongs in architecture/security documentation, not the end-user Reporting page.

Replace it with:

```text
Build, analyze, schedule, export, and manage reports across your organization.
```

---

# 88. Initial Release Scope — Reporting V1

Build first:

```text
Reporting Dashboard
Report Library
Built-In Standard Reports
Search
Filters
Sorting
Date Ranges
Run Report
PDF Export
XLSX Export
CSV Export
Saved Reports
Favorites
Report History
Tenant Isolation
Location Permissions
Department Permissions
Sensitive Data Permissions
```

---

# 89. Reporting V2

Add:

```text
Custom Report Builder
Grouping
Aggregations
Charts
Tenant Templates
Custom Fields
Cross-Module Reporting
Drill-Down
```

---

# 90. Reporting V3

Add:

```text
Scheduled Reports
Email Distribution
Conditional Reports
Compliance Packages
Advanced Analytics
Multi-Site Benchmarking
Executive Reporting
```

---

# 91. Reporting V4

Future:

```text
Natural Language Report Builder
```

Example:

```text
Show all recordable incidents at Stuttgart during the last 12 months grouped by department.
```

The natural-language system must translate the request into a structured authorized report definition.

It must never generate or execute unrestricted raw SQL directly from the user's request.

---

# 92. Acceptance Criteria

The Reporting system is not complete until:

- [ ] Reporting Overview replaces the current empty page
- [ ] Built-in reports are available
- [ ] Reports are tenant scoped
- [ ] Location restrictions are enforced
- [ ] Department restrictions are enforced
- [ ] Sensitive fields are permission controlled
- [ ] Search works
- [ ] Filters work
- [ ] Relative date filters work
- [ ] Sorting works
- [ ] Reports can be saved
- [ ] Reports can be favorited
- [ ] Reports can be exported to PDF
- [ ] Reports can be exported to XLSX
- [ ] Reports can be exported to CSV
- [ ] Report history is audited
- [ ] DOT reports are included
- [ ] Training reports are included
- [ ] Incident reports are included
- [ ] Inspection reports are included
- [ ] Corrective action reports are included
- [ ] Fleet reports are included
- [ ] Equipment reports are included
- [ ] Inventory reports are included
- [ ] Compliance reports are included
- [ ] Tenant custom fields can be reportable
- [ ] No client can submit raw SQL
- [ ] Server-side filtering is implemented
- [ ] Server-side sorting is implemented
- [ ] Large exports use background processing
- [ ] Report permissions cannot bypass module permissions
- [ ] Reporting works on desktop, tablet, and mobile

---

# 93. Final Architecture Requirement

Reporting must be implemented as a shared Forge platform service.

```text
Incidents ─────────────┐
Inspections ───────────┤
Training ──────────────┤
Personnel ─────────────┤
DOT ───────────────────┤
Fleet ─────────────────┤
Inventory ─────────────┤
Equipment ─────────────┤
JSA ───────────────────┤
Observations ──────────┤
LOTO ──────────────────┤
Confined Space ────────┤
Hot Work ──────────────┤
Contractors ───────────┤
Emergency Response ────┤
Environmental ─────────┘
                       ↓
                Reporting Engine
                       ↓
          ┌────────────┼────────────┐
          ↓            ↓            ↓
       Reports      Analytics     Exports
          ↓            ↓            ↓
       PDF/XLSX      Charts      Scheduled
```

Do not create independent reporting implementations inside each module.

Every module must register its approved datasets, fields, relationships, filters, metrics, and permissions with the central Reporting Engine.

---

# 94. Implementation Directive

Replace the existing Reporting page completely.

Do not leave placeholder tables or developer-facing security notes.

Build the Reporting Center as a production-ready Forge Industrial Safety platform feature using the existing tenant, authentication, authorization, module, and design systems.

Preserve the existing Forge Industrial Safety theme and UI conventions.

Reporting must be:

```text
Tenant-aware
Permission-aware
Module-aware
Location-aware
Department-aware
Custom-field-aware
Mobile-friendly
Exportable
Auditable
Extensible
Secure
```

The Reporting system should be designed so every current and future Forge Industrial Safety module can participate without requiring a separate reporting architecture.
