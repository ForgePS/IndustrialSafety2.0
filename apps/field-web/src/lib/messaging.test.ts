import { describe, expect, it } from "vitest";
import {
  annotateMessageClusters,
  initialsFromName,
  messagingThreadTitleDisplay,
  type MessagingMessage,
} from "@/lib/messaging";
import { isFieldFeatureModuleEnabled } from "@/lib/field-modules";
import { fieldHrefForNotification } from "@/lib/notifications-api";
import { fieldHrefFromIndustrialPath } from "@/lib/scan-routes";

function msg(
  partial: Partial<MessagingMessage> & Pick<MessagingMessage, "id" | "senderUserId" | "isOwn">,
): MessagingMessage {
  return {
    body: "",
    messageType: "TEXT",
    senderName: "User",
    createdAt: "2026-09-11T12:00:00.000Z",
    attachments: [],
    ...partial,
  };
}

describe("Field messaging helpers", () => {
  it("clusters consecutive messages from the same sender", () => {
    const clustered = annotateMessageClusters([
      msg({ id: "1", senderUserId: "a", isOwn: false, senderName: "Ada", body: "Hi" }),
      msg({ id: "2", senderUserId: "a", isOwn: false, senderName: "Ada", body: "Again" }),
      msg({ id: "3", senderUserId: "me", isOwn: true, senderName: "Me", body: "Ok" }),
    ]);
    expect(clustered.map((m) => [m.id, m.showSender, m.isClusterStart, m.isClusterEnd])).toEqual([
      ["1", true, true, false],
      ["2", false, false, true],
      ["3", true, true, true],
    ]);
  });

  it("titles direct threads from the other member", () => {
    expect(
      messagingThreadTitleDisplay(
        {
          title: "Chat",
          threadType: "DIRECT",
          members: [
            { userId: "me", role: "MEMBER", displayName: "Me" },
            { userId: "ada", role: "MEMBER", displayName: "Ada Rivera" },
          ],
        },
        "me",
      ),
    ).toBe("Ada Rivera");
    expect(initialsFromName("Ada Rivera")).toBe("AR");
  });

  it("gates Messages feature on MESSAGING module", () => {
    expect(isFieldFeatureModuleEnabled(["MESSAGING"], "messaging")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["CALENDAR"], "messaging")).toBe(false);
  });
});

describe("messaging deep links", () => {
  it("maps industrial messaging hrefs onto Field routes", () => {
    expect(
      fieldHrefFromIndustrialPath("/modules/messaging/?thread=t1", {
        targetType: "",
        targetId: "",
        qrLinkId: "",
      }),
    ).toBe("/messaging/t1/");
    expect(fieldHrefForNotification("/modules/messaging/?thread=t1")).toBe("/messaging/t1/");
    expect(fieldHrefForNotification("/messaging/t1/")).toBe("/messaging/t1/");
  });
});
