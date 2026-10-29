# Forge Industrial Safety — SMS Emergency Alerting & Mvix Digital Signage System

## Document Purpose

This document defines a complete emergency mass-notification system for Forge Industrial Safety.

The system must allow authorized tenant users to create one emergency alert in Forge and distribute it through multiple channels at the same time, including:

- SMS text messaging
- Mvix digital signage
- Forge in-app notifications
- Forge Field App notifications
- Email as an optional secondary channel
- Future push notifications
- Future voice calling
- Future webhook/API integrations

The emergency alerting system must be tenant-aware, location-aware, permission-aware, auditable, fast, simple to operate under stress, and designed so that the same alert can reach employees who are carrying phones and people who are physically inside a facility viewing Mvix displays.

---

# 1. Core Design Goal

An authorized user should be able to:

```text
Create Alert
     ↓
Choose Emergency Type
     ↓
Enter Instructions
     ↓
Choose Locations / Groups
     ↓
Choose Delivery Channels
     ↓
Review
     ↓
Confirm
     ↓
SEND ALERT
```

Forge then distributes the alert simultaneously:

```text
                       FORGE ALERT ENGINE
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ↓                   ↓                   ↓
         SMS                MVIX              FORGE APP
          │                   │                   │
          ↓                   ↓                   ↓
     Employees          Facility TVs        Logged-In Users
```

---

# 2. Recommended Product Name

Use the module name:

```text
Emergency Alerts
```

Recommended full title:

```text
Forge Emergency Alerting
```

The system can live inside the existing Emergency Response module while also being accessible from a global emergency action button.

---

# 3. Primary Routes

```text
/emergency-alerts
/emergency-alerts/new
/emergency-alerts/active
/emergency-alerts/history
/emergency-alerts/templates
/emergency-alerts/groups
/emergency-alerts/contacts
/emergency-alerts/mvix
/emergency-alerts/delivery
/emergency-alerts/drills
/emergency-alerts/settings
```

---

# 4. Main Navigation

Create the following navigation:

```text
Emergency Alerts
├── Dashboard
├── Send Alert
├── Active Alerts
├── Alert History
├── Templates
├── Alert Groups
├── Contacts
├── Mvix Displays
├── Delivery Status
├── Drills & Tests
└── Settings
```

Only show sections the user has permission to access.

---

# 5. Global Emergency Alert Button

Authorized users should have access to a prominent global action:

```text
SEND EMERGENCY ALERT
```

Recommended placement:

- Emergency Alerts dashboard
- Main Forge header quick actions
- Mobile Field App quick actions
- Emergency Response module
- Optional dashboard emergency widget

This button must not instantly broadcast an alert.

It opens the Emergency Alert Composer.

---

# 6. Emergency Alert Dashboard

Route:

```text
/emergency-alerts
```

Header:

```text
Emergency Alerts

Send and manage emergency notifications across SMS, digital signage, and Forge.
```

Primary action:

```text
+ Send Emergency Alert
```

Secondary actions:

```text
Start Drill
Alert History
Manage Templates
Manage Groups
```

---

# 7. Emergency Dashboard Status Cards

Display:

```text
Active Alerts
Alerts Sent Today
SMS Delivery Rate
Mvix Displays Online
Recipients Reached
Acknowledgments Pending
```

Example:

```text
┌──────────────────┐
│ Active Alerts    │
│        1         │
└──────────────────┘

┌──────────────────┐
│ SMS Delivered    │
│      96.8%       │
└──────────────────┘

┌──────────────────┐
│ Mvix Online      │
│      18 / 19     │
└──────────────────┘

┌──────────────────┐
│ Acknowledged     │
│    244 / 287     │
└──────────────────┘
```

---

# 8. Active Alert Banner

If an emergency alert is currently active for the user's authorized scope, display a persistent banner.

Example:

```text
ACTIVE EMERGENCY ALERT

SHELTER IN PLACE

Stuttgart Facility

Issued: 2:14 PM
Updated: 2:18 PM

[ View Alert ] [ Update Alert ] [ Send All Clear ]
```

The banner should remain visible until the alert is ended or cleared.

---

# 9. Alert Types

Provide built-in emergency types.

```text
Fire
Evacuation
Shelter in Place
Severe Weather
Tornado Warning
Chemical Release
Hazardous Material Incident
Gas Leak
Explosion
Medical Emergency
Utility Failure
Power Outage
Security Emergency
Lockdown
Active Threat
Missing Person
Facility Closure
Road / Access Closure
Environmental Emergency
Equipment Emergency
Emergency Drill
All Clear
Custom
```

Tenant admins can:

```text
Add
Edit
Disable
Reorder
```

built-in or tenant-specific alert types.

---

# 10. Alert Severity Levels

Use standardized severity levels.

```text
Advisory
Warning
Critical
Emergency
```

Recommended use:

### Advisory

Important information that does not require immediate protective action.

### Warning

A developing condition that may require action.

### Critical

Immediate action is required.

### Emergency

Immediate life-safety notification.

---

# 11. Alert Status Lifecycle

Alert status:

```text
Draft
Pending Approval
Queued
Sending
Active
Updated
All Clear
Closed
Cancelled
Failed
```

Do not delete emergency alerts after they have been sent.

Sent alerts become permanent audit records subject to retention policy.

---

# 12. Emergency Alert Composer

Route:

```text
/emergency-alerts/new
```

Use a stress-friendly wizard.

```text
1. Alert Type
2. Message
3. Audience
4. Channels
5. Review
6. Confirm & Send
```

Do not force the operator to navigate a complicated form during an emergency.

---

# 13. Step 1 — Alert Type

Display large selectable cards.

Example:

```text
[ FIRE ]

[ EVACUATION ]

[ SHELTER IN PLACE ]

[ SEVERE WEATHER ]

[ CHEMICAL RELEASE ]

[ SECURITY EMERGENCY ]

[ MEDICAL EMERGENCY ]

[ CUSTOM ]
```

Selecting an alert type loads a tenant-approved template.

---

# 14. Step 2 — Alert Message

Fields:

```text
Headline
Short SMS Message
Detailed Instructions
Location Instructions
Effective Time
Expiration
Require Acknowledgment
```

Example:

```text
Headline:
SHELTER IN PLACE

SMS:
EMERGENCY: Shelter in place immediately at the Stuttgart facility.
Remain indoors and await further instructions.

Detailed Instructions:
Move indoors immediately.
Close exterior doors.
Remain away from exterior windows.
Do not leave the facility until an All Clear is issued.
```

---

# 15. Message Preview

Show live previews for each selected delivery channel.

Tabs:

```text
SMS
Mvix
Forge App
Email
```

Example:

```text
SMS PREVIEW

FORGE ALERT — SHELTER IN PLACE
Stuttgart Facility

Shelter in place immediately.
Remain indoors and await further instructions.

Sent 2:14 PM
```

---

# 16. Message Length Handling

The system must show:

```text
Character Count
Estimated SMS Segments
Estimated Recipient Count
Estimated Message Count
```

Long emergency messages should be summarized for SMS while the full message remains available in Forge and on Mvix.

---

# 17. Message Fields

Core alert model:

```text
Alert Type
Severity
Headline
Short Message
Detailed Instructions
Location
Affected Area
Issued By
Issued At
Effective At
Expires At
Status
Acknowledgment Required
All Clear Required
```

---

# 18. Step 3 — Select Audience

Audience selection must support:

```text
Entire Organization
Location
Multiple Locations
Region
Department
Multiple Departments
Shift
Job Role
Employee Group
Emergency Response Team
Supervisor Group
Contractors
Visitors
Custom Alert Group
Individual Employees
```

---

# 19. Location-Based Alerting

Example:

```text
Corporate
├── Stuttgart Plant
│   ├── Production
│   ├── Maintenance
│   ├── Warehouse
│   └── Administration
│
├── Pine Bluff
│
└── Other Facilities
```

Selecting:

```text
Stuttgart Plant
```

can automatically target:

```text
Employees assigned to Stuttgart
Contractors assigned to Stuttgart
Mvix displays assigned to Stuttgart
Relevant Forge users
```

---

# 20. Dynamic Recipient Count

Show a live count before sending.

Example:

```text
Recipients

Employees:          284
Contractors:         18
Emergency Team:      12

Unique SMS Numbers: 296

Mvix Displays:       19
Forge Users:        241
```

Deduplicate recipients automatically.

---

# 21. Recipient Exclusions

Support controlled exclusions:

```text
Inactive Employee
Terminated Employee
Invalid Phone Number
SMS Opt-Out
No Mobile Number
Outside Selected Location
Duplicate Number
Temporarily Disabled
```

Display exclusion summary before send.

Example:

```text
296 eligible SMS recipients
4 excluded
```

The user can view why recipients were excluded.

---

# 22. Step 4 — Delivery Channels

Selectable channels:

```text
☑ SMS
☑ Mvix Digital Signage
☑ Forge In-App
☑ Forge Field App

Optional:
☐ Email
```

Future:

```text
Push Notification
Voice Call
Microsoft Teams
Slack
Public Address Integration
Webhook
```

---

# 23. Default Channel Rules

Tenant admins can configure defaults.

Example:

```text
Emergency:
SMS + Mvix + Forge App

Critical:
SMS + Mvix + Forge App

Warning:
SMS + Forge App

Advisory:
Forge App
```

Operators may only change defaults if permitted.

---

# 24. Step 5 — Review

Before broadcast, show:

```text
Alert Type
Severity
Headline
Message
Affected Locations
Recipient Count
Mvix Display Count
Channels
Acknowledgment Requirement
Expiration
Issued By
```

Example:

```text
ALERT REVIEW

Type: Chemical Release
Severity: Emergency

Location:
Stuttgart Plant

SMS Recipients:
296

Mvix Displays:
19

Channels:
SMS
Mvix
Forge App

Acknowledgment:
Required

[ Back ] [ Confirm Emergency Alert ]
```

---

# 25. Step 6 — Confirmation

For Critical and Emergency severity require explicit confirmation.

Example:

```text
You are about to send an EMERGENCY alert to:

296 SMS recipients
19 Mvix displays
241 Forge users

Type SEND to confirm:
[ __________ ]

[ Cancel ] [ Send Emergency Alert ]
```

Do not use accidental single-click activation for life-safety alerts.

---

# 26. Optional Two-Person Approval

Tenant setting:

```text
Require Two-Person Approval
```

Options:

```text
Off
Emergency Alerts Only
Critical + Emergency
All Alerts
```

Workflow:

```text
Operator Creates Alert
       ↓
Alert Pending Approval
       ↓
Authorized Approver Reviews
       ↓
Approve
       ↓
Broadcast
```

Emergency bypass can optionally exist for specifically authorized roles.

All bypass actions must be audited.

---

# 27. Alert Broadcast Engine

The alert must be created once and distributed through a central orchestration service.

```text
Alert Created
      ↓
Validation
      ↓
Permission Check
      ↓
Recipient Resolution
      ↓
Audience Snapshot
      ↓
Broadcast Job
      ↓
┌────────────┬────────────┬────────────┐
│ SMS Worker │ Mvix Worker│ App Worker │
└────────────┴────────────┴────────────┘
      ↓
Delivery Status
      ↓
Acknowledgment
      ↓
Audit Log
```

---

# 28. SMS Provider Architecture

Do not hard-code Forge to a single SMS provider.

Create:

```text
SmsProvider
```

interface.

Possible adapters:

```text
AwsEndUserMessagingSmsProvider
TwilioSmsProvider
FutureProvider
```

Recommended first provider for the existing AWS Forge environment:

```text
AWS End User Messaging SMS / Amazon SNS integration
```

Twilio can remain an optional provider where advanced two-way messaging or an existing tenant Twilio account is preferred.

---

# 29. SMS Provider Configuration

Tenant/system settings:

```text
Provider
Origination Identity
Sender Pool
Messaging Service
Default Region
Transactional Message Type
Delivery Logging
Two-Way Messaging
Opt-Out Handling
Status Callback
Monthly Spend Limit
Per-Alert Spend Guard
```

Credentials must be stored in a secure secret manager.

Never store provider secrets in front-end code.

---

# 30. SMS Message Classification

Emergency employee notifications should be treated as transactional/operational messaging when supported by the configured provider.

The implementation must still respect applicable carrier, consent, sender-registration, opt-out, and jurisdictional requirements.

Do not assume SMS delivery is guaranteed.

---

# 31. SMS Delivery Status

Track provider status for every SMS.

Common normalized statuses:

```text
Queued
Accepted
Sent
Delivered
Undelivered
Failed
Rejected
Unknown
```

Each provider adapter converts provider-specific statuses into the Forge normalized status model.

---

# 32. Delivery Is Not Acknowledgment

Keep two separate concepts:

```text
DELIVERED
```

means the provider/carrier reports message delivery.

```text
ACKNOWLEDGED
```

means the person affirmatively confirmed the alert.

Never treat SMS delivery as proof the employee saw or understood the alert.

---

# 33. SMS Acknowledgment

When enabled, SMS messages can contain:

```text
Reply ACK to confirm receipt.
```

or:

```text
Confirm: https://alert.forge.../a/ABC123
```

Supported acknowledgment methods:

```text
SMS Reply
Secure One-Time Link
Forge App Button
Field App Button
```

Normalized acknowledgment status:

```text
Not Required
Pending
Acknowledged
Declined
Unable to Comply
No Response
```

---

# 34. Two-Way SMS Commands

If two-way SMS is enabled, support approved keywords:

```text
ACK
YES
SAFE
HELP
```

Do not overload regulatory opt-out keywords such as STOP.

Example:

```text
ACK
```

records:

```text
Employee
Alert
Phone Number
Received At
Acknowledgment Method
```

---

# 35. Opt-Out Handling

The platform must honor provider/carrier opt-out rules.

Store:

```text
SMS Eligible
SMS Opt-Out Status
Opt-Out Source
Opt-Out Date
Provider Status
```

Emergency Alert operators must see excluded recipients but must not be able to silently override a provider/carrier block.

Example:

```text
SMS Exclusions

2 recipients opted out
1 invalid phone number
1 missing phone number
```

---

# 36. SMS Contact Validation

Normalize all phone numbers to:

```text
E.164
```

Example:

```text
+18705551212
```

Validate:

```text
Country Code
Phone Number Format
Duplicate Number
SMS Eligibility
Provider Opt-Out
```

---

# 37. Emergency Contact Source

Employee numbers should come from the authoritative Personnel profile.

Recommended fields:

```text
Employee ID
Employee Name
Employment Status
Primary Location
Department
Shift
Job Role
Mobile Phone
SMS Enabled
Emergency Alert Eligible
Language
Supervisor
```

Avoid maintaining a disconnected duplicate emergency-contact directory unless necessary.

---

# 38. Emergency Alert Groups

Route:

```text
/emergency-alerts/groups
```

Built-in group types:

```text
All Employees
All Supervisors
Emergency Response Team
Management
Safety Team
Maintenance
Security
First Aid Team
Weather Team
Evacuation Wardens
Contractors
```

Allow tenant-created groups.

---

# 39. Dynamic Groups

Support rule-based groups.

Example:

```text
Group:
Stuttgart Night Shift

Rules:
Location = Stuttgart
AND
Shift = Night
AND
Employment Status = Active
```

Dynamic groups resolve membership at send time.

---

# 40. Static Groups

Support manually maintained groups.

Example:

```text
Emergency Management Team
```

Members are explicitly selected.

---

# 41. Temporary Groups

Allow temporary incident groups.

Example:

```text
Chemical Release Response Team — Sep 4
```

Temporary groups can expire automatically.

---

# 42. Mvix Integration Strategy

Forge should support Mvix through a dedicated adapter:

```text
MvixAlertProvider
```

The preferred initial integration is:

```text
Forge CAP Feed
       ↓
Mvix CAP Alert Content App
       ↓
Assigned Mvix Players
       ↓
Emergency Content Overrides Normal Signage
```

This allows Forge to be the alert origin while Mvix remains the signage-delivery system.

---

# 43. Why Use CAP for Mvix

Forge should generate a standards-based Common Alerting Protocol feed.

Recommended:

```text
CAP 1.2
```

The tenant configures the Forge CAP URL in Mvix.

Example:

```text
https://alerts.forgepublicsafety.com/cap/{tenant-public-feed-id}
```

Do not expose the tenant's internal database ID in the public feed URL.

Use a randomized/public feed identifier.

---

# 44. Mvix CAP Flow

```text
Forge Emergency Alert
        ↓
CAP Renderer
        ↓
Tenant CAP Feed
        ↓
Mvix Polls CAP Feed
        ↓
Mvix Detects Active Alert
        ↓
Normal Content Overridden
        ↓
Emergency Alert Displayed
```

When the alert expires or an All Clear is issued:

```text
CAP Feed Updated
        ↓
Mvix Alert Ends
        ↓
Normal Content Resumes
```

---

# 45. CAP Feed Types

Support:

```text
Single Active Alert Feed
Multiple Active Alerts Index
```

For a tenant with multiple active facility alerts, provide a CAP index that references each alert document.

Example concept:

```text
/cap/{tenant-feed-id}/index.xml
/cap/{tenant-feed-id}/alerts/{alert-public-id}.xml
```

---

# 46. Mvix Location Mapping

Create a mapping table:

```text
Forge Location
        ↔
Mvix Device / Player / Device Group
```

Example:

```text
Forge Location: Stuttgart Plant
Mvix Group: Stuttgart All Displays

Forge Location: Stuttgart Warehouse
Mvix Group: Warehouse Displays

Forge Location: Stuttgart Admin
Mvix Group: Administrative Displays
```

---

# 47. Mvix Displays Page

Route:

```text
/emergency-alerts/mvix
```

Columns:

```text
Forge Location
Mvix Display
Mvix Device ID
Mvix Group
Alert Enabled
CAP Feed
Last Check
Status
Actions
```

Status:

```text
Online
Offline
Unknown
Not Configured
Alert Disabled
```

---

# 48. Mvix Setup Wizard

Create:

```text
Configure Mvix
```

Wizard:

```text
1. Select Forge Location
2. Configure Mvix Integration Method
3. Generate CAP Feed
4. Map Mvix Displays
5. Configure Alert Theme
6. Test Alert
7. Confirm
```

---

# 49. Mvix Integration Methods

Support:

```text
CAP Feed
Direct Mvix Integration
Manual / External
```

## CAP Feed

Recommended default.

Forge publishes the alert source.

Mvix is configured once to monitor it.

## Direct Mvix Integration

Optional adapter if the tenant has the required Mvix API/custom integration access.

## Manual / External

Tracks Mvix as a manually triggered external channel when direct automation is unavailable.

---

# 50. Do Not Depend on Mvix Direct API for V1

The V1 emergency alert system must not require Mvix's optional custom API product.

Use CAP as the primary integration.

Keep the direct API adapter interface available for future implementation.

---

# 51. Mvix Alert Theme Mapping

Tenant admins can map Forge alert types to Mvix themes.

Example:

```text
Fire
→ FIRE / EVACUATE Theme

Shelter in Place
→ SHELTER IN PLACE Theme

Severe Weather
→ WEATHER EMERGENCY Theme

Chemical Release
→ HAZMAT Theme

All Clear
→ ALL CLEAR Theme
```

Forge should still provide:

```text
Headline
Description
Location
Effective Time
Expiration
```

through CAP.

---

# 52. Mvix Alert Screen Content

Recommended emergency screen:

```text
EMERGENCY ALERT

SHELTER IN PLACE

STUTTGART FACILITY

Shelter in place immediately.
Remain indoors and await further instructions.

Issued: 2:14 PM
```

The signage version should prioritize readability.

Avoid long paragraphs.

---

# 53. Mvix Display Rules

Emergency signage should:

- Override normal scheduled content
- Use large headline text
- Use concise instructions
- Show facility/location
- Show alert type
- Show issued or updated time
- Remain active until expiration or All Clear
- Avoid nonessential animations
- Remain readable from distance

---

# 54. Mvix All Clear

All Clear should be a distinct event.

Example:

```text
ALL CLEAR

The Shelter in Place order for the Stuttgart facility has ended.

Resume normal operations unless instructed otherwise.

Issued: 3:02 PM
```

Tenant setting:

```text
All Clear Display Duration
```

Example:

```text
5 minutes
10 minutes
15 minutes
Manual Clear
```

After the duration, Mvix resumes normal signage.

---

# 55. Mvix Test Mode

Provide a test mode that cannot be confused with a real emergency.

Example:

```text
SYSTEM TEST

THIS IS A TEST

No action is required.
```

Mvix test alerts should include:

```text
TEST
```

in the headline and description.

---

# 56. Emergency Drills

Route:

```text
/emergency-alerts/drills
```

Support:

```text
Fire Drill
Evacuation Drill
Shelter in Place Drill
Severe Weather Drill
Chemical Emergency Drill
Custom Drill
```

Drill mode may send:

```text
SMS
Mvix
Forge App
```

Every message must clearly indicate:

```text
DRILL
```

or:

```text
TEST — NO ACTION REQUIRED
```

depending on tenant configuration.

---

# 57. Alert Templates

Route:

```text
/emergency-alerts/templates
```

Template fields:

```text
Name
Alert Type
Severity
SMS Template
Mvix Headline
Mvix Description
App Message
Default Audience
Default Locations
Default Channels
Acknowledgment Required
Default Expiration
Active
```

---

# 58. Template Variables

Support variables:

```text
{{company_name}}
{{location_name}}
{{alert_type}}
{{headline}}
{{issued_time}}
{{expires_time}}
{{sender_name}}
{{department_name}}
{{assembly_area}}
{{shelter_area}}
{{emergency_number}}
```

---

# 59. Example Fire Template

```text
Type:
Fire

Severity:
Emergency

SMS:
FORGE ALERT — FIRE
{{location_name}}
Evacuate using the nearest safe exit.
Report to your assigned assembly area.
Do not re-enter until All Clear.

Mvix Headline:
FIRE — EVACUATE

Mvix Description:
Evacuate immediately using the nearest safe exit.
Proceed to your assigned assembly area.
Do not re-enter the building.
```

---

# 60. Example Severe Weather Template

```text
Type:
Severe Weather

Severity:
Critical

SMS:
FORGE ALERT — SEVERE WEATHER
{{location_name}}
Move to your designated severe-weather shelter immediately.
Remain there until All Clear.

Mvix Headline:
SEVERE WEATHER

Mvix Description:
Move to the designated severe-weather shelter immediately.
Remain sheltered until an All Clear is issued.
```

---

# 61. Example Chemical Release Template

```text
Type:
Chemical Release

Severity:
Emergency

SMS:
FORGE ALERT — CHEMICAL RELEASE
{{location_name}}
Follow facility emergency instructions immediately.
Do not enter the affected area.
Await further instructions.

Mvix Headline:
CHEMICAL EMERGENCY

Mvix Description:
Do not enter the affected area.
Follow facility emergency procedures.
Await additional instructions.
```

---

# 62. Alert Update Workflow

Active alerts can be updated.

Action:

```text
Update Alert
```

Update types:

```text
Instructions Changed
Affected Area Changed
Severity Changed
Audience Expanded
Expiration Extended
Situation Update
```

Each update generates a new alert version.

Never overwrite the historical sent message.

---

# 63. Alert Versioning

Example:

```text
Alert EA-2026-000214

Version 1 — 2:14 PM
Original Shelter in Place

Version 2 — 2:22 PM
Expanded to Warehouse

Version 3 — 2:41 PM
Updated Instructions

Version 4 — 3:02 PM
All Clear
```

---

# 64. Rebroadcasting Updates

When updating an alert, operator can choose:

```text
Send Update To:
☑ SMS
☑ Mvix
☑ Forge App
```

Options:

```text
All Original Recipients
Newly Affected Recipients Only
Custom Audience
```

---

# 65. All Clear Workflow

Active alert action:

```text
Send All Clear
```

Confirmation:

```text
You are ending an active emergency alert.

The All Clear will be sent to:
296 SMS recipients
19 Mvix displays
241 Forge users

[ Cancel ] [ Confirm All Clear ]
```

---

# 66. Escalation Rules

Support escalation when required acknowledgments are missing.

Example:

```text
After 5 minutes:
Re-send SMS to unacknowledged recipients

After 10 minutes:
Notify supervisors

After 15 minutes:
Notify emergency management
```

Escalations must be configurable.

Do not automatically create unlimited resend loops.

---

# 67. Supervisor Escalation

Example:

```text
Employee:
John Smith

Alert:
Shelter in Place

Status:
No acknowledgment after 10 minutes

Supervisor:
Jane Doe

Action:
Supervisor notified
```

---

# 68. Delivery Dashboard

Route:

```text
/emergency-alerts/delivery
```

Display active delivery metrics:

```text
SMS Targeted
SMS Queued
SMS Sent
SMS Delivered
SMS Failed
SMS Opted Out

Mvix Targeted
Mvix Active
Mvix Offline
Mvix Unknown

Forge Notifications Sent
Forge Notifications Viewed

Acknowledged
Pending
Unable to Comply
```

---

# 69. Recipient Delivery Table

Columns:

```text
Employee
Employee ID
Location
Department
Phone
SMS Status
Acknowledgment
Acknowledged At
Forge App Status
Actions
```

Actions:

```text
View
Resend
Contact Supervisor
```

Resend actions require permission and are audited.

---

# 70. Mvix Delivery Table

Columns:

```text
Display
Location
Device / Group
Alert
Integration Method
Last Status
Last Checked
Status
```

---

# 71. Delivery Failure Handling

For SMS failure:

```text
Retry eligible temporary failures
Do not retry permanent invalid-number failures
Do not bypass opt-out
Record provider error
Notify operator when threshold exceeded
```

Example operator warning:

```text
SMS Delivery Warning

18 messages failed.

[ View Failures ]
```

---

# 72. Mvix Failure Handling

If an Mvix display is known to be unavailable:

```text
Mvix Alert Delivery Warning

1 of 19 displays is offline.

Warehouse Breakroom Display
Last Seen: 1:42 PM
```

Do not delay the rest of the emergency broadcast because one signage device is unavailable.

---

# 73. Alert History

Route:

```text
/emergency-alerts/history
```

Columns:

```text
Alert ID
Type
Severity
Headline
Location
Issued By
Issued At
Status
SMS Recipients
Mvix Displays
Acknowledged
Actions
```

Actions:

```text
View
Delivery Report
Audit Log
Export
Duplicate as New Alert
```

---

# 74. Alert Detail Page

Route:

```text
/emergency-alerts/:alertId
```

Tabs:

```text
Overview
Message
Audience
Delivery
Acknowledgments
Mvix
Updates
Audit Log
Attachments
```

---

# 75. Emergency Alert ID

Generate a human-readable ID.

Example:

```text
EA-2026-000214
```

Do not use this as the database primary key.

Use a UUID internally.

---

# 76. Emergency Contact Management

Route:

```text
/emergency-alerts/contacts
```

Display:

```text
Employee
Employee ID
Location
Department
Mobile Phone
SMS Eligible
Opt-Out Status
Last Verified
Status
```

Filters:

```text
Location
Department
SMS Eligible
Missing Phone
Invalid Phone
Opted Out
Inactive
```

---

# 77. Contact Data Quality Dashboard

Show:

```text
Active Employees
Employees With Mobile Number
Employees Missing Mobile Number
Invalid Numbers
SMS Opt-Outs
Duplicate Numbers
Numbers Not Recently Verified
```

This allows admins to fix recipient-data problems before an emergency.

---

# 78. Contact Verification

Optional workflow:

```text
Send Verification Message
```

Example:

```text
Forge Emergency Alerts:
This number is registered to receive workplace emergency notifications.
Reply ACK to confirm.
```

Record:

```text
Verified
Verified At
Verification Method
```

---

# 79. Employee Self-Service

Where allowed, employees can view:

```text
Emergency Mobile Number
SMS Status
Verification Status
Alert Language
```

Any phone-number change must follow existing Personnel update rules and audit requirements.

---

# 80. Language Support

Allow a preferred alert language on the employee profile.

V1:

```text
English
Spanish
```

Architecture must support additional languages.

Templates can contain multiple language versions.

Do not rely on real-time machine translation for critical alerts unless the tenant explicitly enables and validates it.

---

# 81. Alert Attachments

Forge App may support attachments:

```text
Evacuation Map
Shelter Map
Safety Data Sheet
Incident Map
Emergency Procedure
```

SMS should link to a secure mobile alert page rather than attempt to attach large files.

Mvix should prioritize short emergency instructions rather than document attachments.

---

# 82. Public Alert Detail Link

Optional:

```text
https://alerts.forgepublicsafety.com/a/{public-token}
```

The public/mobile alert page can show:

```text
Alert Type
Headline
Current Instructions
Location
Issued Time
Latest Update
Acknowledgment Button
```

Do not expose:

```text
Employee roster
Internal phone numbers
Sensitive incident data
Responder-only information
```

---

# 83. Alert Authentication Modes

Alert links may be:

```text
Public Safety Message
Tokenized Employee Alert
Authenticated Forge Alert
```

Choose the minimum exposure required.

---

# 84. Mvix CAP Public Endpoint Security

The CAP endpoint needs to be reachable by Mvix.

Use:

```text
Random Feed Identifier
Rate Limiting
Read Only
No Internal Tenant IDs
No Administrative Operations
Minimal Alert Data
```

Example:

```text
/cap/4f8e2c2d7a9a/index.xml
```

Avoid:

```text
/cap/tenant/123
```

---

# 85. CAP 1.2 Data Model

Generate fields including:

```text
identifier
sender
sent
status
msgType
scope
category
event
urgency
severity
certainty
effective
expires
headline
description
instruction
areaDesc
```

Only include fields supported and appropriate for the configured Mvix implementation.

---

# 86. Example Forge CAP Alert

```xml
<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>EA-2026-000214</identifier>
  <sender>alerts@forgepublicsafety.com</sender>
  <sent>2026-09-04T14:14:00-05:00</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>

  <info>
    <category>Safety</category>
    <event>Shelter in Place</event>
    <urgency>Immediate</urgency>
    <severity>Severe</severity>
    <certainty>Observed</certainty>

    <effective>2026-09-04T14:14:00-05:00</effective>
    <expires>2026-09-04T16:14:00-05:00</expires>

    <headline>SHELTER IN PLACE</headline>

    <description>
      Shelter in place immediately at the affected facility.
    </description>

    <instruction>
      Remain indoors and await further instructions.
    </instruction>

    <area>
      <areaDesc>Stuttgart Facility</areaDesc>
    </area>
  </info>
</alert>
```

CAP generation must be schema validated before publication.

---

# 87. CAP Message Types

Support appropriate message lifecycle types:

```text
Alert
Update
Cancel
```

Forge alert lifecycle should map safely to the CAP lifecycle.

---

# 88. CAP Status

Drill/test alerts should not be published as an actual emergency.

Map Forge drill/test state to the appropriate CAP status according to implementation policy.

Production emergency alerts and drills must remain clearly distinguishable.

---

# 89. Mvix Configuration Record

Recommended model:

```text
tenant_id
forge_location_id
integration_method
mvix_device_id
mvix_device_group_id
mvix_display_name
cap_feed_public_id
cap_enabled
direct_api_enabled
alert_theme_mapping
last_status
last_checked_at
enabled
```

---

# 90. Optional Direct Mvix Adapter

Create interface:

```ts
interface DigitalSignageAlertProvider {
  sendAlert(alert: Alert, targets: DisplayTarget[]): Promise<ProviderResult>;
  updateAlert(alert: Alert, targets: DisplayTarget[]): Promise<ProviderResult>;
  clearAlert(alert: Alert, targets: DisplayTarget[]): Promise<ProviderResult>;
  testConnection(): Promise<ProviderHealth>;
}
```

Implement:

```text
MvixCapProvider
```

first.

Future:

```text
MvixApiProvider
```

if licensed API access and required endpoints are available.

---

# 91. Forge Notification Integration

Every alert should also create an internal Forge notification.

Notification states:

```text
Sent
Delivered
Viewed
Acknowledged
```

Alert should appear in:

```text
Forge Web
Forge Field App
Notification Center
Emergency Dashboard
```

---

# 92. Field App Emergency Mode

When an Emergency/Critical alert is active, the Field App can display:

```text
EMERGENCY ALERT

CHEMICAL RELEASE

STUTTGART FACILITY

Do not enter the affected area.
Follow emergency instructions.

[ ACKNOWLEDGE ]
```

The user should not be required to navigate into the Emergency module to see it.

---

# 93. Emergency Alert Permissions

Create:

```text
emergency_alerts.view
emergency_alerts.create
emergency_alerts.send
emergency_alerts.update
emergency_alerts.clear
emergency_alerts.cancel
emergency_alerts.approve
emergency_alerts.bypass_approval
emergency_alerts.resend
emergency_alerts.view_delivery
emergency_alerts.view_contacts
emergency_alerts.manage_contacts
emergency_alerts.manage_groups
emergency_alerts.manage_templates
emergency_alerts.manage_mvix
emergency_alerts.manage_sms
emergency_alerts.run_drills
emergency_alerts.manage_settings
emergency_alerts.admin
```

---

# 94. Recommended Role Defaults

## Tenant Admin

```text
Full alert configuration
```

## Safety Director

```text
Create
Send
Update
Clear
View Delivery
Run Drills
```

## Plant Manager

```text
Create
Send
Update
Clear
View Delivery
```

## Supervisor

Configurable:

```text
View
Create
Send to own department/location
```

## Employee

```text
Receive
View
Acknowledge
```

---

# 95. Scope Restrictions

Permissions must support:

```text
Tenant
Region
Location
Department
Role
```

Example:

A Stuttgart supervisor with:

```text
emergency_alerts.send
```

must not automatically gain authority to alert another plant.

---

# 96. Alert Send Authorization

Server must verify:

```text
Authenticated User
Tenant
Permission
Location Scope
Audience Scope
Channel Permission
Template Permission
Approval Requirement
```

before creating the broadcast job.

Never trust front-end audience counts or location IDs as authorization.

---

# 97. Recommended Database Tables

Create or adapt:

```text
emergency_alerts
emergency_alert_versions
emergency_alert_types
emergency_alert_templates
emergency_alert_audiences
emergency_alert_recipients
emergency_alert_channels
emergency_alert_deliveries
emergency_alert_acknowledgments
emergency_alert_groups
emergency_alert_group_members
emergency_alert_group_rules
emergency_alert_approvals
emergency_alert_escalations
emergency_alert_provider_events
emergency_alert_mvix_targets
emergency_alert_mvix_mappings
emergency_alert_cap_feeds
emergency_alert_settings
emergency_alert_audit_logs
```

---

# 98. emergency_alerts Table

Suggested fields:

```text
id
tenant_id
alert_number
alert_type_id
severity
headline
short_message
detailed_message
instructions
status
is_drill
requires_acknowledgment
created_by
approved_by
issued_at
effective_at
expires_at
cleared_at
closed_at
created_at
updated_at
```

---

# 99. emergency_alert_versions Table

```text
id
tenant_id
alert_id
version_number
change_type
headline
short_message
detailed_message
instructions
severity
effective_at
expires_at
created_by
created_at
```

---

# 100. emergency_alert_recipients Table

Snapshot recipients at send time.

```text
id
tenant_id
alert_id
employee_id
contractor_id
recipient_type
location_id
department_id
phone_number_snapshot
language
sms_eligible
exclusion_reason
created_at
```

Do not rely on dynamically re-querying the current employee roster when reconstructing historical alert delivery.

---

# 101. emergency_alert_deliveries Table

```text
id
tenant_id
alert_id
alert_version_id
recipient_id
channel
provider
provider_message_id
status
queued_at
sent_at
delivered_at
failed_at
failure_code
failure_reason
attempt_count
last_attempt_at
created_at
updated_at
```

---

# 102. emergency_alert_acknowledgments Table

```text
id
tenant_id
alert_id
recipient_id
employee_id
status
method
acknowledged_at
response_text
created_at
```

Unique rule:

```text
alert_id + recipient_id
```

---

# 103. emergency_alert_channels Table

```text
id
tenant_id
alert_id
channel
enabled
status
target_count
success_count
failure_count
started_at
completed_at
created_at
updated_at
```

---

# 104. emergency_alert_approvals Table

```text
id
tenant_id
alert_id
requested_by
approver_id
status
requested_at
reviewed_at
comments
bypassed
bypass_reason
created_at
```

---

# 105. emergency_alert_groups Table

```text
id
tenant_id
name
description
group_type
location_id
department_id
dynamic
rule_json
enabled
created_at
updated_at
created_by
```

---

# 106. emergency_alert_cap_feeds Table

```text
id
tenant_id
location_id
public_feed_id
enabled
feed_type
last_generated_at
created_at
updated_at
```

---

# 107. emergency_alert_mvix_mappings Table

```text
id
tenant_id
forge_location_id
mvix_device_id
mvix_device_group_id
display_name
integration_method
cap_feed_id
enabled
last_status
last_checked_at
metadata_json
created_at
updated_at
```

---

# 108. emergency_alert_provider_events Table

Store provider callbacks and normalized events.

```text
id
tenant_id
delivery_id
provider
provider_event_id
provider_status
normalized_status
payload_reference
received_at
processed_at
```

Avoid storing unnecessary sensitive provider payload data indefinitely.

---

# 109. Emergency Alert API

Recommended:

```text
GET    /api/emergency-alerts
POST   /api/emergency-alerts
GET    /api/emergency-alerts/:id
PATCH  /api/emergency-alerts/:id

POST   /api/emergency-alerts/:id/submit-for-approval
POST   /api/emergency-alerts/:id/approve
POST   /api/emergency-alerts/:id/send
POST   /api/emergency-alerts/:id/update
POST   /api/emergency-alerts/:id/all-clear
POST   /api/emergency-alerts/:id/cancel

GET    /api/emergency-alerts/:id/delivery
GET    /api/emergency-alerts/:id/acknowledgments
GET    /api/emergency-alerts/:id/audit

POST   /api/emergency-alerts/:id/acknowledge
POST   /api/emergency-alerts/:id/resend
```

---

# 110. Emergency Template API

```text
GET    /api/emergency-alerts/templates
POST   /api/emergency-alerts/templates
GET    /api/emergency-alerts/templates/:id
PATCH  /api/emergency-alerts/templates/:id
DELETE /api/emergency-alerts/templates/:id
```

Use soft delete/archive when templates have historical references.

---

# 111. Alert Group API

```text
GET    /api/emergency-alerts/groups
POST   /api/emergency-alerts/groups
GET    /api/emergency-alerts/groups/:id
PATCH  /api/emergency-alerts/groups/:id
DELETE /api/emergency-alerts/groups/:id

POST   /api/emergency-alerts/groups/:id/preview
```

Preview returns recipient count without broadcasting.

---

# 112. Mvix API Endpoints in Forge

```text
GET    /api/emergency-alerts/mvix
POST   /api/emergency-alerts/mvix/mappings
PATCH  /api/emergency-alerts/mvix/mappings/:id
DELETE /api/emergency-alerts/mvix/mappings/:id

POST   /api/emergency-alerts/mvix/test
GET    /api/emergency-alerts/mvix/status
```

---

# 113. CAP Endpoints

Public read-only:

```text
GET /cap/:publicFeedId/index.xml
GET /cap/:publicFeedId/alerts/:publicAlertId.xml
```

Administrative:

```text
POST /api/emergency-alerts/cap/feeds
PATCH /api/emergency-alerts/cap/feeds/:id
POST /api/emergency-alerts/cap/feeds/:id/test
```

---

# 114. SMS Provider Webhooks

Provider callback endpoints:

```text
POST /api/webhooks/emergency-alerts/sms/status
POST /api/webhooks/emergency-alerts/sms/inbound
```

Validate provider webhook signatures when supported.

Do not process unverified inbound webhook requests as trusted provider events.

---

# 115. Alert Queue

Use a durable queue.

Example architecture:

```text
Emergency Alert API
       ↓
Broadcast Orchestrator
       ↓
AWS Queue
       ↓
┌──────────────────────┐
│ SMS Delivery Worker  │
│ Mvix / CAP Worker    │
│ Forge Notify Worker  │
└──────────────────────┘
```

Emergency alert processing must not rely on a browser remaining open.

---

# 116. Priority Queue

Emergency alerts should use a high-priority queue separate from ordinary notifications.

Example:

```text
emergency-alert-high
notification-normal
scheduled-low
```

Do not allow marketing or routine notification traffic to block emergency messaging.

---

# 117. Idempotency

Every alert send request must use an idempotency key.

Purpose:

```text
Prevent accidental duplicate broadcasts
```

Example:

```text
alert_id + version + channel
```

A browser retry must not send the same emergency text twice unless the user explicitly chooses Resend.

---

# 118. Retry Strategy

For transient provider failures:

```text
Attempt 1
Short Retry
Backoff Retry
Final Failure
```

Retry rules must differ by failure type.

Do not retry:

```text
Invalid Number
Opted Out
Permission Denied
Permanent Provider Rejection
```

---

# 119. Alert Timeouts

Emergency alerts should have:

```text
effective_at
expires_at
```

If the user does not specify expiration, tenant defaults may apply.

Example defaults:

```text
Advisory: 4 hours
Warning: 2 hours
Critical: 2 hours
Emergency: Manual All Clear or configured maximum
```

The UI must clearly show expiration behavior.

---

# 120. Offline Behavior

## SMS

Provider may continue attempting delivery according to provider rules.

## Forge App

Store notification until the device reconnects.

## Mvix

If the player cannot reach its external CAP source, the system cannot assume the current Forge emergency alert was displayed.

Display offline status where available and preserve other alert channels.

Do not treat digital signage as the sole life-safety notification channel.

---

# 121. Alert Reliability Dashboard

Admin view:

```text
SMS Provider
Healthy

Mvix CAP Feed
Healthy

Forge Notifications
Healthy

Queue
Healthy

Provider Callbacks
Healthy
```

If degraded:

```text
DEGRADED
```

with details.

---

# 122. System Health Checks

Check:

```text
SMS provider connectivity
SMS configuration
Queue health
Worker health
CAP endpoint availability
CAP XML validity
Mvix mapping configuration
Forge notification service
Webhook processing
Database connectivity
```

---

# 123. Test Alert System

Provide:

```text
Send Test Alert
```

Test targets:

```text
Me Only
Selected Administrators
Test Group
Selected Mvix Display
All Test Displays
```

Never default a test to the entire employee population.

---

# 124. Scheduled System Tests

Allow tenant admins to schedule recurring delivery tests.

Example:

```text
First Monday of each month
9:00 AM
Safety Team Test Group
```

Every test message must be clearly marked.

---

# 125. Delivery Test Report

After a test show:

```text
SMS:
12 targeted
12 delivered

Mvix:
3 targeted
3 active

Forge:
12 targeted
12 delivered
```

Store the test in:

```text
Drills & Tests
```

not normal incident history unless configured.

---

# 126. Alert Analytics

Provide:

```text
Alerts Sent
Alerts by Type
Alerts by Location
Average SMS Delivery Rate
Average Acknowledgment Rate
Average Acknowledgment Time
Delivery Failures
Contact Data Issues
Mvix Availability
Drill Performance
```

---

# 127. Emergency Alert Reports

Integrate with Forge Reporting.

Built-in reports:

```text
Emergency Alert History
Emergency Alert Delivery Report
Emergency Alert Acknowledgment Report
SMS Delivery Failure Report
Mvix Alert Delivery Report
Alert Response Time Report
Emergency Drill Report
Contact Readiness Report
Alert Audit Report
```

---

# 128. Alert Export

Support:

```text
PDF
XLSX
CSV
```

Emergency Alert PDF:

```text
Company
Alert ID
Alert Type
Severity
Location
Issued By
Issued At
Message
Updates
All Clear
Recipient Summary
SMS Delivery
Mvix Delivery
Acknowledgments
Audit Summary
```

---

# 129. Audit Logging

Audit:

```text
Alert Created
Alert Edited
Alert Submitted for Approval
Alert Approved
Alert Approval Rejected
Approval Bypassed
Alert Sent
Alert Updated
Alert Re-Sent
All Clear Sent
Alert Cancelled
Template Created
Template Modified
Group Created
Group Modified
Mvix Mapping Changed
SMS Provider Changed
Test Alert Sent
Recipient Manually Re-Sent
```

---

# 130. Audit Fields

Record:

```text
Tenant
User
Date / Time
IP
Action
Alert ID
Old Value
New Value
Affected Scope
Reason
```

---

# 131. Security Requirements

Required:

```text
Tenant Isolation
Role-Based Access Control
Location Scope
Department Scope
Server-Side Authorization
Encrypted Secrets
Encrypted Data at Rest
Encrypted Transport
Webhook Signature Validation
Audit Logging
Rate Limiting
Idempotency
CSRF Protection
Input Validation
CAP XML Escaping
```

---

# 132. False Alert Protection

Implement:

```text
Explicit confirmation
Optional two-person approval
Permission scope
Alert preview
Audience count
Channel count
Typed confirmation for Emergency severity
Audit trail
Idempotency
```

Do not add unnecessary friction that prevents rapid activation by properly authorized users.

---

# 133. Emergency Alert Settings

Route:

```text
/emergency-alerts/settings
```

Tabs:

```text
General
SMS
Mvix
Recipients
Templates
Approvals
Acknowledgments
Escalations
Drills
Security
Retention
```

---

# 134. General Settings

```text
Emergency Alerting Enabled
Default Alert Severity
Default Alert Expiration
Default Channels
Allow Custom Alerts
Allow Alert Updates
Require All Clear
Default Time Zone
Alert ID Prefix
```

---

# 135. SMS Settings

```text
SMS Enabled
Provider
Origination Identity
Messaging Service / Pool
Default Country
Delivery Logging
Inbound SMS Enabled
Acknowledgments by SMS
Opt-Out Handling
Spend Guard
Max Recipients per Alert
Test Number
```

---

# 136. Mvix Settings

```text
Mvix Enabled
Integration Method
CAP Feed Enabled
CAP Feed Public ID
Default Alert Theme
All Clear Theme
Test Theme
Default Display Scope
Status Check Enabled
```

---

# 137. Approval Settings

```text
Require Approval
Severity Levels Requiring Approval
Approver Roles
Allow Emergency Bypass
Bypass Roles
Require Bypass Reason
```

---

# 138. Acknowledgment Settings

```text
Require Acknowledgment by Default
Allowed Acknowledgment Methods
Reminder Interval
Maximum Reminders
Supervisor Escalation
Escalation Time
```

---

# 139. Drill Settings

```text
Drills Enabled
Drill Roles
Default Test Group
Allow SMS During Drills
Allow Mvix During Drills
Require DRILL Prefix
Scheduled Tests
```

---

# 140. Retention Settings

Configure retention for:

```text
Alert Records
Delivery Logs
Provider Events
Acknowledgments
Audit Logs
Exports
Drill Records
```

Do not allow retention settings to remove records that must be retained under tenant policy or applicable legal requirements.

---

# 141. UI Components

Create reusable components:

```text
EmergencyAlertButton
EmergencyAlertDashboard
ActiveAlertBanner
AlertTypeSelector
AlertSeveritySelector
EmergencyComposer
AudienceSelector
LocationTreeSelector
AlertGroupSelector
ChannelSelector
SmsPreview
MvixPreview
ForgePreview
AlertReview
AlertConfirmation
AlertApprovalPanel
DeliveryDashboard
DeliveryProgress
RecipientDeliveryTable
MvixDeliveryTable
AcknowledgmentDashboard
EmergencyTemplateEditor
EmergencyGroupEditor
MvixMappingManager
CapFeedManager
TestAlertDialog
AllClearDialog
EmergencyAuditTimeline
```

---

# 142. Mobile UI

Emergency Alerting must be fully usable on a phone.

Mobile composer priorities:

```text
Large buttons
Minimal typing
Template-first workflow
Fast location selection
Large Confirm button
Clear recipient count
Clear channel count
No dense desktop tables
```

---

# 143. Mobile Quick Send

Authorized Field App users may use:

```text
Emergency
    ↓
Select Alert
    ↓
Select Location
    ↓
Review
    ↓
Confirm
```

Templates prefill the message.

The user can edit instructions before sending if permitted.

---

# 144. Accessibility

Emergency pages should support:

```text
Keyboard Navigation
Screen Readers
High Contrast
Clear Text Labels
No Color-Only Meaning
Large Touch Targets
Responsive Text
```

Emergency severity should always use text/icon labels in addition to color.

---

# 145. Notifications to Administrators

System warnings can notify alert administrators of:

```text
High SMS Failure Rate
Mvix Displays Offline
SMS Provider Degraded
CAP Feed Failure
Queue Failure
Contact Data Problems
Acknowledgment Threshold Not Met
```

---

# 146. Alert Failure Threshold

Tenant example:

```text
Warn operator if SMS failure > 5%
Critical warning if SMS failure > 15%
```

Thresholds must be configurable.

---

# 147. External Emergency Sources

Future integration support:

```text
Weather Alerts
CAP Feeds
Security System
Fire Alarm System
Industrial Control Event
Access Control
Weather API
External Mass Notification Platform
```

External triggers must not automatically generate a company-wide emergency broadcast unless explicitly configured and validated.

---

# 148. Incoming CAP Alerts

Future capability:

```text
External CAP Source
       ↓
Forge Alert Intake
       ↓
Rules Engine
       ↓
Operator Approval or Automatic Policy
       ↓
SMS + Mvix + Forge
```

Examples:

```text
Tornado Warning
Severe Thunderstorm Warning
Flash Flood Warning
```

Automatic rules should be location-scoped.

---

# 149. Weather Alert Automation

Future tenant rule example:

```text
IF
NWS Tornado Warning intersects Stuttgart Facility

THEN
Create Tornado Warning Alert

Channels:
SMS
Mvix
Forge

Approval:
Automatic or Required, based on tenant policy
```

Store original external alert source and identifier.

---

# 150. Forge Emergency Alert Engine Service

Recommended service boundary:

```text
EmergencyAlertService
AudienceResolver
AlertApprovalService
BroadcastOrchestrator
SmsDeliveryService
DigitalSignageService
MvixCapService
ForgeNotificationService
AcknowledgmentService
EscalationService
EmergencyAuditService
```

---

# 151. Audience Resolver

The Audience Resolver converts selected groups into an immutable recipient snapshot.

Input:

```text
Tenant
Locations
Departments
Roles
Groups
Individuals
```

Output:

```text
Unique Recipients
SMS Numbers
Forge User IDs
Mvix Targets
Exclusions
```

---

# 152. Alert Snapshot Requirement

At send time snapshot:

```text
Recipient
Location
Department
Phone
Channel Eligibility
Template Version
Alert Text
Audience Definition
```

Historical emergency records must remain accurate even if employee data changes later.

---

# 153. High Availability

Emergency alert infrastructure should avoid single points of failure where practical.

Recommended:

```text
Managed Queue
Multiple Workers
Database Redundancy
Object Storage
Health Monitoring
Retry Handling
Provider Status Monitoring
```

---

# 154. Provider Failover

Architect for provider failover but do not silently switch origination identities without compliance configuration.

Future:

```text
Primary SMS Provider
Secondary SMS Provider
```

Failover requires:

```text
Preconfigured Sender
Compliance Registration
Tested Routing
Audit
```

---

# 155. Rate Limits and Throughput

The broadcast engine must:

```text
Respect provider throughput
Batch safely
Track queue delay
Prioritize emergency messages
Prevent duplicate sends
```

Show the operator:

```text
Queued
Sending
Delivered
Failed
```

rather than implying every message leaves instantly.

---

# 156. Cost Guardrails

SMS settings can include:

```text
Monthly Spend Warning
Monthly Spend Limit
Per-Alert Estimate
Unexpected Recipient Count Warning
```

Emergency authority should not be blocked by an arbitrary front-end cost estimate unless the provider itself prevents sending.

---

# 157. Emergency Alert Dashboard Layout

Suggested:

```text
EMERGENCY ALERTS

Mass notification across SMS, Mvix digital signage, and Forge.

[ SEND EMERGENCY ALERT ] [ START DRILL ]

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Active Alerts   │ │ SMS Delivery    │ │ Mvix Online     │
│       1         │ │     96.8%       │ │     18 / 19     │
└─────────────────┘ └─────────────────┘ └─────────────────┘

┌─────────────────┐
│ Acknowledged    │
│   244 / 287     │
└─────────────────┘


ACTIVE ALERT
────────────────────────────────────────────────────

SHELTER IN PLACE
Stuttgart Facility

Issued 2:14 PM

Shelter in place immediately.
Remain indoors and await further instructions.

[ View ] [ Update Alert ] [ Send All Clear ]


RECENT ALERTS
────────────────────────────────────────────────────

Alert              Location        Issued       Status
Severe Weather     Stuttgart       8/28         Closed
Fire Drill          Warehouse       8/21         Drill
Power Outage        Stuttgart       8/12         Closed


SYSTEM READINESS
────────────────────────────────────────────────────

SMS Provider        Healthy
Mvix CAP             Healthy
Forge Notifications Healthy
Contact Readiness    98.7%
```

---

# 158. Emergency Composer Layout

Suggested:

```text
SEND EMERGENCY ALERT

Step 1 of 6 — Alert Type

[ FIRE ]            [ EVACUATION ]

[ SHELTER IN PLACE ][ SEVERE WEATHER ]

[ CHEMICAL RELEASE ][ SECURITY ]

[ MEDICAL ]         [ CUSTOM ]


Selected:
SHELTER IN PLACE

[ Cancel ]                         [ Continue ]
```

---

# 159. Audience Screen Layout

```text
WHO SHOULD RECEIVE THIS ALERT?

Locations
☑ Stuttgart Plant
☐ Pine Bluff
☐ All Locations

Groups
☑ All Employees
☑ Contractors
☐ Emergency Response Team Only

Recipients
296 SMS
241 Forge Users
19 Mvix Displays

[ Back ]                          [ Continue ]
```

---

# 160. Channel Screen Layout

```text
DELIVERY CHANNELS

☑ SMS
296 recipients

☑ Mvix Digital Signage
19 displays

☑ Forge
241 users

☐ Email
287 recipients

Acknowledgment
☑ Require employee acknowledgment

[ Back ]                          [ Continue ]
```

---

# 161. Active Alert Detail Layout

```text
EA-2026-000214

SHELTER IN PLACE
Emergency

Stuttgart Facility

ACTIVE

Issued:
2:14 PM

Updated:
2:22 PM

SMS
296 targeted
287 delivered
5 pending
4 failed

Mvix
19 targeted
18 active
1 offline

Acknowledgments
244 acknowledged
43 pending

[ Update Alert ]
[ Resend to Pending ]
[ Send All Clear ]
```

---

# 162. V1 Scope

Build first:

```text
Emergency Alert Dashboard
Send Alert Wizard
Alert Templates
Location / Department Targeting
Employee Recipient Resolution
SMS Provider Adapter
SMS Broadcast
SMS Delivery Tracking
Mvix CAP Feed
Mvix Location Mapping
Mvix Alert Preview
Forge In-App Alert
Active Alerts
Alert Updates
All Clear
Alert History
Audit Log
Test Alerts
Basic Acknowledgment
Permissions
Tenant Isolation
```

---

# 163. V2 Scope

Add:

```text
Two-Way SMS ACK
Secure Acknowledgment Links
Supervisor Escalation
Dynamic Alert Groups
Two-Person Approval
Advanced Mvix Status Monitoring
Multi-Language Templates
Scheduled Drills
Emergency Reports
Contact Readiness Dashboard
```

---

# 164. V3 Scope

Add:

```text
External CAP Intake
Weather Automation
Push Notifications
Voice Alerts
Secondary SMS Provider
Microsoft Teams
Slack
Webhooks
Advanced Escalation
Multi-Tenant Corporate Alerting
```

---

# 165. V4 Scope

Future:

```text
Automated Alert Recommendations
Emergency Operations Dashboard
GIS Affected-Area Targeting
Facility Floor/Zone Targeting
IoT / Alarm Inputs
Access Control Integration
PA System Integration
```

Human authorization must remain central for high-impact broadcast actions unless the tenant has explicitly configured a trusted automatic source and policy.

---

# 166. Acceptance Criteria

The emergency alert system is not complete until:

- [ ] Authorized users can create an emergency alert
- [ ] Alert templates are available
- [ ] Alerts can target the entire tenant
- [ ] Alerts can target individual locations
- [ ] Alerts can target multiple locations
- [ ] Alerts can target departments
- [ ] Alerts can target groups
- [ ] Alerts can target individual employees
- [ ] Recipient counts are shown before send
- [ ] Duplicate phone numbers are removed
- [ ] Invalid numbers are excluded
- [ ] SMS opt-outs are honored
- [ ] SMS can be sent through an approved provider
- [ ] SMS provider results are tracked
- [ ] Delivery and acknowledgment are separate statuses
- [ ] Mvix CAP feed is generated
- [ ] Mvix locations can be mapped to Forge locations
- [ ] Mvix alert content is location specific
- [ ] Mvix alerts can be tested
- [ ] Forge in-app alerts are sent
- [ ] Active alerts are clearly visible
- [ ] Alerts can be updated
- [ ] Updates are versioned
- [ ] All Clear can be issued
- [ ] All Clear reaches the original audience
- [ ] All Clear updates Mvix
- [ ] Drills are clearly identified as tests
- [ ] Critical sends require confirmation
- [ ] Permission scope is enforced server-side
- [ ] Users cannot alert unauthorized locations
- [ ] Broadcast processing uses a durable queue
- [ ] Browser closure does not interrupt a send
- [ ] Send operations are idempotent
- [ ] Delivery failures are visible
- [ ] Audit logs are permanent according to retention policy
- [ ] Alert history is searchable
- [ ] Mobile workflows are usable under stress
- [ ] The Mvix direct API is not required for the CAP-based V1
- [ ] Provider credentials are stored securely
- [ ] Public CAP endpoints expose no administrative data
- [ ] Emergency and routine notification queues are separated
- [ ] Test mode cannot be mistaken for a real alert

---

# 167. Recommended Forge / Mvix Implementation

For the first production implementation use:

```text
FORGE
  │
  ├── Emergency Alert Composer
  │
  ├── Audience Resolver
  │
  ├── Broadcast Orchestrator
  │
  ├── SMS Provider
  │
  ├── Forge Notifications
  │
  └── CAP 1.2 Publisher
             │
             ↓
          MVIX CMS
             │
             ↓
        CAP Alert App
             │
             ↓
     Assigned Mvix Players
             │
             ↓
  Emergency Alert Overrides
       Normal Signage
```

This keeps Forge as the single emergency-alert control point while Mvix continues to manage the physical digital-signage network.

---

# 168. Final Implementation Directive

Build Emergency Alerts as a shared Forge platform service rather than as a simple SMS page.

The system must provide one emergency workflow that can simultaneously reach:

```text
Employee Phones
Facility Digital Signage
Forge Web Users
Forge Field App Users
```

The user should create the emergency message once.

Forge is responsible for:

```text
Authorization
Audience Resolution
Channel Orchestration
SMS Distribution
CAP Publication
Mvix Target Mapping
Forge Notifications
Delivery Tracking
Acknowledgments
Updates
All Clear
Audit Logging
```

Mvix remains responsible for rendering emergency content on configured digital signage players.

The first Mvix integration should use a Forge-generated CAP feed so that normal signage can be overridden automatically when a Forge emergency alert becomes active.

Do not make Forge dependent on a paid/custom Mvix API for the first release.

Keep the integration adapter extensible so direct Mvix API support can be added later if the tenant has the required API access.

The final feature must be:

```text
Tenant-aware
Location-aware
Permission-aware
Fast
Auditable
Mobile-friendly
Multi-channel
Provider-independent
Failure-tolerant
Testable
Extensible
```

The goal is one emergency alert command center inside Forge Industrial Safety that controls the full employee and facility notification workflow.
