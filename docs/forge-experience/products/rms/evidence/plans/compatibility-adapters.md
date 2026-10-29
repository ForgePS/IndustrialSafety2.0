# Compatibility Adapters (Design) — FX-S2A

**Path:** `evidence/plans/compatibility-adapters.md`  
**Implementation:** Not started (S2B+)

## Goals

Allow RMS to adopt FX presentation without rewriting auth, flags, or domain APIs.

## Adapters

### RmsFxFlagBridge

- Input: platform effective feature flags
- Output: `{ fxShell, fxNav, fxIncidents, … }` booleans
- Default: all FX flags false / missing → legacy UI

### RmsNavAdapter

- Input: current hardcoded groups + flags (+ optional Config Studio nav when DEC-S2-005 decides)
- Output: `FxNavItem[]` for `FxAppShell`

### RmsAuthSessionAdapter

- Pass-through of `@forge/web-kit` `useAuth()` into shell slots
- **No** auth behavior changes

### RmsListControlsAdapter

- Wraps existing list experiences during S2E
- Retirement when FxTable parity accepted

### RmsFeatureGateChrome

- Maps disabled-flag state to `FxEmptyState` / `FxAlert` copy parity

### RmsIncidentWorkspaceAdapter (S2D)

- Maps incident header/tabs/sections onto `FxWorkspaceLayout`
- Preserves `?section=` keys and specialty permission gates

## Non-goals

- No new cross-module task DB
- No NERIS payload changes
- No schema migrations
