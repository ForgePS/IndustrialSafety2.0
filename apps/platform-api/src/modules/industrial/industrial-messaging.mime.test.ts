import { describe, expect, it } from "vitest";
import {
  buildMessagePreview,
  isAllowedMessagingMime,
  isValidHttpUrl,
  messagingAttachmentTypeForMime,
} from "./industrial-messaging.mime.js";

describe("industrial-messaging.mime", () => {
  it("allows common image and document types", () => {
    expect(isAllowedMessagingMime("image/png")).toBe(true);
    expect(isAllowedMessagingMime("application/pdf")).toBe(true);
    expect(isAllowedMessagingMime("application/x-msdownload")).toBe(false);
  });

  it("classifies attachment types", () => {
    expect(messagingAttachmentTypeForMime("image/jpeg")).toBe("IMAGE");
    expect(messagingAttachmentTypeForMime("application/pdf")).toBe("DOCUMENT");
    expect(messagingAttachmentTypeForMime("application/octet-stream")).toBe("FILE");
  });

  it("validates http(s) urls", () => {
    expect(isValidHttpUrl("https://example.com/doc")).toBe(true);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("not-a-url")).toBe(false);
  });

  it("builds message previews", () => {
    expect(buildMessagePreview("Hello team", false)).toBe("Hello team");
    expect(buildMessagePreview("", true)).toBe("Shared an attachment");
  });
});
