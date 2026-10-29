import { describe, expect, it } from "vitest";
import { FIELD_PERMISSIONS, type FieldPermission } from "@forge/contracts";
import { hasFieldPermission } from "@/lib/field-permissions";
import {
  fieldHrefForNotification,
  fieldNotificationCardTitle,
  groupFieldNotificationsByPerson,
  initialsFromDisplayName,
} from "@/lib/notifications-api";
import { fieldHrefFromIndustrialPath } from "@/lib/scan-routes";
import { filterEventsForLocation } from "@/lib/calendar/range";
import { filterTasksForDivision, filterTasksForLocation, type FieldWorkItem } from "@/lib/my-work";
import { setOfflineScope, pendingOfflineCount, enqueueOfflineMutation } from "@/lib/offline";

describe("permission audit", () => {
  it("denies each Field permission when only unrelated codes are present", () => {
    const unrelated = ["platform.person.read"] as const;
    for (const permission of FIELD_PERMISSIONS as readonly FieldPermission[]) {
      expect(hasFieldPermission(unrelated, permission)).toBe(false);
    }
  });

  it("allows each Field permission when that exact code is granted", () => {
    for (const permission of FIELD_PERMISSIONS as readonly FieldPermission[]) {
      expect(hasFieldPermission([permission], permission)).toBe(true);
    }
  });
});

describe("cross Location / Division filters", () => {
  const items: FieldWorkItem[] = [
    {
      kind: "task",
      id: "1",
      title: "A",
      subtitle: null,
      dueAt: null,
      priority: null,
      status: "OPEN",
      estimatedMinutes: null,
      href: "/tasks/item/1/",
      locationId: "loc-1",
      locationName: "Plant A",
      divisionName: "North",
    },
    {
      kind: "task",
      id: "2",
      title: "B",
      subtitle: null,
      dueAt: null,
      priority: null,
      status: "OPEN",
      estimatedMinutes: null,
      href: "/tasks/item/2/",
      locationId: "loc-2",
      locationName: "Plant B",
      divisionName: "South",
    },
  ];

  it("filters My Work by Location and Division", () => {
    expect(filterTasksForLocation(items, "loc-1").map((i) => i.id)).toEqual(["1"]);
    expect(filterTasksForDivision(items, "South").map((i) => i.id)).toEqual(["2"]);
  });

  it("filters calendar events by Location (site_id)", () => {
    const events = [
      { id: "1", title: "A", siteId: "loc-1", startsAt: null, endsAt: null },
      { id: "2", title: "B", siteId: "loc-2", startsAt: null, endsAt: null },
    ];
    expect(filterEventsForLocation(events, "loc-1").map((e) => e.id)).toEqual(["1"]);
  });
});

describe("Field Alerts person grouping", () => {
  it("clusters messaging notifications from the same sender together", () => {
    const groups = groupFieldNotificationsByPerson([
      {
        id: "n1",
        type: "industrial.messaging.new_message",
        title: "New message from Ada Rivera",
        body: "Latest",
        createdAt: "2026-09-11T12:00:00.000Z",
        metadataJson: { senderUserId: "u-ada", senderName: "Ada Rivera" },
      },
      {
        id: "n2",
        type: "industrial.messaging.new_message",
        title: "New message from Bob Chen",
        body: "From Bob",
        createdAt: "2026-09-11T11:30:00.000Z",
        metadataJson: { senderUserId: "u-bob" },
      },
      {
        id: "n3",
        type: "industrial.messaging.new_message",
        title: "New message from Ada Rivera",
        body: "Earlier",
        createdAt: "2026-09-11T11:00:00.000Z",
        metadataJson: { senderUserId: "u-ada" },
      },
      {
        id: "n4",
        title: "Reminder due",
        body: "Check PPE",
        createdAt: "2026-09-11T10:00:00.000Z",
      },
    ]);

    expect(groups.map((g) => g.key)).toEqual(["user:u-ada", "user:u-bob", "solo:n4"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["n1", "n3"]);
    expect(groups[0]?.label).toBe("Ada Rivera");
    expect(fieldNotificationCardTitle(groups[0]!.items[0]!, { underPersonHeader: true })).toBe(
      "Latest",
    );
    expect(initialsFromDisplayName("Ada Rivera")).toBe("AR");
  });
});

describe("notification deep links", () => {
  it("maps industrial module hrefs to Field routes", () => {
    expect(
      fieldHrefFromIndustrialPath("/modules/calendar?eventId=e1", {
        targetType: "",
        targetId: "",
        qrLinkId: "",
      }),
    ).toBe("/calendar/?eventId=e1");
    expect(
      fieldHrefFromIndustrialPath("/modules/reminders?reminderId=r1", {
        targetType: "",
        targetId: "",
        qrLinkId: "",
      }),
    ).toBe("/reminders/?reminderId=r1");
    expect(
      fieldHrefFromIndustrialPath("/modules/tasks?taskId=t1", {
        targetType: "",
        targetId: "",
        qrLinkId: "",
      }),
    ).toBe("/tasks/item/t1/");
    expect(
      fieldHrefFromIndustrialPath("/modules/sanitation", {
        targetType: "",
        targetId: "",
        qrLinkId: "",
      }),
    ).toBe("/sanitation/");
  });

  it("keeps Field hrefs and remaps modules via notification helper", () => {
    expect(fieldHrefForNotification("/training/a1/")).toBe("/training/a1/");
    expect(fieldHrefForNotification("/modules/corrective?id=c1")).toBe("/corrective/c1/");
    expect(fieldHrefForNotification("/modules/messaging/?thread=t9")).toBe("/messaging/t9/");
    expect(fieldHrefForNotification("")).toBe("/alerts/");
  });
});

describe("offline scope isolation", () => {
  it("does not count pending when scope is cleared", () => {
    setOfflineScope({ tenantId: "t1", userId: "u1" });
    enqueueOfflineMutation({
      domain: "industrial.observations",
      method: "POST",
      path: "/api/v1/industrial/observations",
      body: { title: "test" },
    });
    expect(pendingOfflineCount()).toBeGreaterThanOrEqual(0);
    setOfflineScope(null);
    expect(pendingOfflineCount()).toBe(0);
  });
});
