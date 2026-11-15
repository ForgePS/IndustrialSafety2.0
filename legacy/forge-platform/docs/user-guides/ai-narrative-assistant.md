# User guide — AI Narrative Assistant

**Audience:** Officers, investigators, instructors, and admins using Forge products  
**Status:** Foundation only — disabled by default. Not available on the Phase 4 synthetic tenant. Phase 5 is not authorized.

## What it does

The AI Narrative Assistant helps draft or improve narrative text from authorized record fields. It is a drafting aid. You remain responsible for every statement that is saved or submitted.

It does **not**:

- Finalize incidents or investigations
- Submit to NERIS
- Submit an ePCR
- Replace your judgment

## Before you start

1. Your organization must enable the feature (all `ai.narrative.*` flags are off by default).
2. You need the appropriate permissions (for example generate and accept).
3. You must acknowledge the accuracy warning on each generate request.

## Typical workflow

1. Open a record and choose **Generate** or **Improve** narrative (when enabled in your product).
2. Review the draft labeled **AI DRAFT — NOT REVIEWED**.
3. Check missing-information and conflict warnings.
4. **Accept** (all or selected sections), **Reject** with a reason, or **Regenerate**.
5. After accept, treat the text as **AI-ASSISTED — HUMAN REVIEWED** and verify against source facts before any regulatory submission.

## Quality check

When enabled, quality check reviews chronology, clarity, professionalism, and facts-only guidance. Results are advisory; they do not approve the record.

## Sensitive data

Restricted fields are blocked by default. Sending restricted data requires special permission, explicit confirmation, and a documented business purpose. Prefer excluding categories you do not need.

## Usage and policies

Admins with usage permissions can view tenant usage summaries. Policy changes are controlled by platform administrators and remain restricted in this foundation.

## Getting help

If drafts look wrong or the feature is unexpectedly available, contact your tenant admin. Security concerns: follow your incident process and disable `ai.narrative.enabled` if needed.
