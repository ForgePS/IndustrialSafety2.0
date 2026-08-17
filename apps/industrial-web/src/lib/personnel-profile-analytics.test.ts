import { describe, expect, it } from "vitest";
import {
  buildProfileMetrics,
  completedPersonnelForms,
  computeSafetyScore,
  emptyPersonnelProfileAnalytics,
  isExpiringSoon,
  isPastDate,
  itemsForSection,
  latestIsoDate,
  moduleListHref,
  sectionTitle,
} from "./personnel-profile-analytics";

describe("personnel profile analytics helpers", () => {
  it("starts every person at a perfect safety score", () => {
    expect(emptyPersonnelProfileAnalytics("p1").safetyScore).toBe(100);
  });

  it("penalizes open incidents and overdue training", () => {
    const base = emptyPersonnelProfileAnalytics("p1");
    const score = computeSafetyScore({
      ...base,
      incidents: { ...base.incidents, open: 1, recordable: 1 },
      training: { ...base.training, overdue: 1, completed: 2 },
      qualifications: { ...base.qualifications, expired: 1, expiringSoon: 1 },
      observations: { ...base.observations, total: 3 },
    });
    // 100 - 12 - 8 - 6 - 5 - 2 + min(4,10) + min(3,5) = 74
    expect(score).toBe(74);
  });

  it("picks the latest ISO date", () => {
    expect(latestIsoDate(["2024-01-01", "2025-06-01", null, ""])).toBe("2025-06-01");
    expect(latestIsoDate([])).toBeNull();
  });

  it("detects past and soon-to-expire dates", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    expect(isPastDate("2026-01-01", now)).toBe(true);
    expect(isExpiringSoon("2026-08-20", 30, now)).toBe(true);
    expect(isExpiringSoon("2026-12-01", 30, now)).toBe(false);
  });

  it("builds module hrefs with an optional search hint", () => {
    expect(moduleListHref("incidents")).toBe("/modules/incidents/");
    expect(moduleListHref("training", "EMP-23344")).toBe("/modules/training/?q=EMP-23344");
  });

  it("maps analytics into the eight safety cards", () => {
    const analytics = emptyPersonnelProfileAnalytics("p1");
    analytics.incidents = { ...analytics.incidents, total: 2, open: 1 };
    analytics.training = { ...analytics.training, completed: 4, enrollments: 5, overdue: 1 };
    const metrics = buildProfileMetrics(analytics, "EMP-1");
    expect(metrics).toHaveLength(8);
    expect(metrics[0]).toMatchObject({
      label: "Incidents",
      value: 2,
      section: "incidents",
    });
    expect(metrics[3]).toMatchObject({ label: "Training", value: 4 });
    // Styling stays on the Sneat theme: metrics carry no bespoke accent colors.
    expect(metrics.some((m) => "accent" in m)).toBe(false);
    expect(itemsForSection(analytics, "overdue")).toEqual([]);
    expect(sectionTitle("personnel-forms")).toBe("Personnel forms");
  });

  it("shows only completed submissions in personnel forms", () => {
    const analytics = emptyPersonnelProfileAnalytics("p1");
    const template = {
      id: "template-1",
      module: "forms",
      label: "Blank form",
      date: "2026-08-01",
      href: "/modules/forms/",
    };
    const submission = {
      id: "submission-1",
      module: "forms",
      label: "Completed form",
      date: "2026-08-02",
      status: "submitted",
      href: "/modules/forms/",
    };
    const draft = {
      id: "submission-2",
      module: "forms",
      label: "Draft form",
      date: "2026-08-03",
      status: "draft",
      href: "/modules/forms/",
    };
    analytics.forms.templates = [template];
    analytics.forms.submissions = [submission, draft];

    expect(itemsForSection(analytics, "personnel-forms")).toEqual([submission]);
    expect(completedPersonnelForms(analytics)).toEqual([submission]);
  });
});
