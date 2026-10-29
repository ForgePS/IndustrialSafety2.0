import { describe, expect, it } from "vitest";
import {
  detectLinks,
  ensureMessagingFilename,
  formatFileSize,
  guessMessagingMime,
  initialsFromName,
  annotateMessageClusters,
  messagingParticipantLine,
  splitMessageBodyWithLinks,
  tenantUserOptions,
} from "./messaging";

describe("messaging helpers", () => {
  it("formats file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("builds initials", () => {
    expect(initialsFromName("Jane Doe")).toBe("JD");
    expect(initialsFromName("Forge")).toBe("FO");
  });

  it("clusters consecutive messages from the same sender", () => {
    const clustered = annotateMessageClusters([
      {
        id: "1",
        body: "Hi",
        messageType: "TEXT",
        senderUserId: "a",
        senderName: "Ada",
        createdAt: "2026-01-01T00:00:00Z",
        attachments: [],
        isOwn: false,
      },
      {
        id: "2",
        body: "Again",
        messageType: "TEXT",
        senderUserId: "a",
        senderName: "Ada",
        createdAt: "2026-01-01T00:00:01Z",
        attachments: [],
        isOwn: false,
      },
      {
        id: "3",
        body: "Hello",
        messageType: "TEXT",
        senderUserId: "b",
        senderName: "Bob",
        createdAt: "2026-01-01T00:00:02Z",
        attachments: [],
        isOwn: true,
      },
      {
        id: "4",
        body: "Me too",
        messageType: "TEXT",
        senderUserId: "b",
        senderName: "Bob",
        createdAt: "2026-01-01T00:00:03Z",
        attachments: [],
        isOwn: true,
      },
    ]);
    expect(clustered.map((m) => [m.id, m.showSender, m.isClusterStart, m.isClusterEnd])).toEqual([
      ["1", true, true, false],
      ["2", false, false, true],
      ["3", true, true, false],
      ["4", false, false, true],
    ]);
  });

  it("detects links in text", () => {
    expect(detectLinks("See https://example.com/a.pdf for details")).toEqual([
      { url: "https://example.com/a.pdf", title: "https://example.com/a.pdf" },
    ]);
  });

  it("splits body into text and link segments", () => {
    expect(splitMessageBodyWithLinks("Go to https://forge.io now")).toEqual([
      { type: "text", value: "Go to " },
      { type: "link", value: "https://forge.io" },
      { type: "text", value: " now" },
    ]);
  });

  it("maps tenant users excluding self with ALL CAPS labels", () => {
    const options = tenantUserOptions(
      [
        { id: "a", primaryEmail: "a@example.com", displayName: "Alice" },
        {
          id: "b",
          primaryEmail: "b@example.com",
          displayName: "Bob Smith",
          employeeNumber: "EMP-1",
          siteLabel: "Stuttgart",
        },
        { id: "membership-1", userId: "c", email: "c@example.com", displayName: "Chris" },
      ],
      "a",
    );
    expect(options.map((o) => o.id)).toEqual(["b", "c"]);
    expect(options[0]?.label).toBe("BOB SMITH");
    expect(messagingParticipantLine(options[0]!)).toBe("#EMP-1 · BOB SMITH · STUTTGART");
  });

  it("guesses screenshot MIME when browser omits type", () => {
    const unnamed = new File([new Uint8Array([1, 2, 3])], "blob", { type: "" });
    expect(guessMessagingMime(unnamed)).toBe("image/png");
    expect(ensureMessagingFilename(unnamed, "image/png")).toBe("screenshot.png");

    const png = new File([new Uint8Array([1])], "Snip.PNG", { type: "" });
    expect(guessMessagingMime(png)).toBe("image/png");
  });
});
