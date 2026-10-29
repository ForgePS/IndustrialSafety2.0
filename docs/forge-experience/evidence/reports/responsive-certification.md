# Responsive Certification — FX-S1.5

**Document:** `docs/forge-experience/reference/responsive-certification.md`  
**Subject:** Forge Experience reference shell + dashboard widgets  
**Date:** 2026-07-30  
**Status:** COMPLETE

## Breakpoints validated

| Width | Device class | Navigation | Tables            | Dialogs    | Dashboards  | Forms | Workspace | Charts    | Maps           | Record pages |
| ----- | ------------ | ---------- | ----------------- | ---------- | ----------- | ----- | --------- | --------- | -------------- | ------------ |
| 320   | Phone        | Stack      | H-scroll cells OK | Full-width | 1-col cards | Stack | Tabs wrap | SVG scale | Controls stack | OK           |
| 375   | Phone        | Stack      | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 390   | Phone        | Stack      | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 414   | Phone        | Stack      | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 430   | Phone        | Stack      | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 600   | Tablet       | Stack/side | OK                | OK         | 2-col begin | OK    | OK        | OK        | OK             | OK           |
| 768   | Tablet       | Side       | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 820   | Tablet       | Side       | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 1024  | Laptop       | Side       | OK                | OK         | Multi-col   | OK    | OK        | OK        | Side-by-side   | OK           |
| 1280  | Desktop      | Side       | OK                | OK         | Full grid   | OK    | OK        | OK        | OK             | OK           |
| 1366  | Desktop      | Side       | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 1440  | Desktop      | Side       | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 1600  | Large        | Side       | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 1920  | Ops display  | Side       | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |
| 2560  | Ops display  | Side       | OK                | OK         | OK          | OK    | OK        | OK        | OK             | OK           |

Evidence screenshot: `docs/forge-experience/evidence/screenshots/fx-s15-dashboard-mobile-375.png`

## Issues

| ID    | Severity | Component    | Description                                               | Recommended fix                                    | Status   |
| ----- | -------- | ------------ | --------------------------------------------------------- | -------------------------------------------------- | -------- |
| R-001 | Medium   | `FxAppShell` | Phone widths show persistent full nav list (no hamburger) | Collapsible nav drawer                             | Open     |
| R-002 | Low      | `FxTable`    | Wide tables rely on native overflow                       | Document scroll container pattern for product apps | Accepted |
| R-003 | Low      | `FxMapPanel` | Drawing tool buttons full-width in control column         | Acceptable for reference                           | Accepted |

## Sign-off

Responsive certification complete for RC1 reference surfaces. No production layouts modified.
