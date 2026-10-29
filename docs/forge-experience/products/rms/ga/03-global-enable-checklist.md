# 03 — Global Enable Checklist

**Status:** **BLOCKED** — do not execute

## Gate: pilot success

- [ ] Pilot tenant designated (no placeholders) in `../pilot/02-pilot-tenant.md`
- [ ] All approved waves completed in pilot
- [ ] Live rollback validated (&lt; 5 minutes)
- [ ] No open P0
- [ ] No open migration/pilot P1
- [ ] Monitoring stable for pilot window
- [ ] Performance acceptable vs legacy baseline
- [ ] Accessibility pilot pass recorded
- [ ] User feedback reviewed; defects dispositioned
- [ ] Pilot closeout recommendation = `READY FOR GENERAL AVAILABILITY`
- [ ] Executive approval recorded (name, date)

## Gate: GA config

- [ ] Strategy selected (A/B/C) in `02-feature-flag-strategy.md`
- [ ] Support plan staffed (`05-support-plan.md`)
- [ ] Monitoring/alerts active (`04-monitoring-plan.md`)
- [ ] Rollback drill completed for cohort (`07-rollback-plan.md`)
- [ ] Communications to tenants prepared
- [ ] CAD Connections Wave 8 evidence complete (or formally deferred)

## Gate: execute

- [ ] Change window scheduled
- [ ] Dual-control on flag changes (`platform.feature.manage`)
- [ ] Post-change verification script/checklist run
- [ ] Hypercare started

**If any gate fails → do not globally enable. Remain on tenant overrides or legacy.**
