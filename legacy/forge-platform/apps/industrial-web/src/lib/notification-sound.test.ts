import { describe, expect, it } from "vitest";
import { playNotificationChime, unlockNotificationAudio } from "./notification-sound";

describe("notification-sound", () => {
  it("exposes unlock and play helpers without throwing", () => {
    expect(typeof unlockNotificationAudio).toBe("function");
    expect(typeof playNotificationChime).toBe("function");
    expect(() => unlockNotificationAudio()).not.toThrow();
    expect(() => playNotificationChime()).not.toThrow();
  });
});
