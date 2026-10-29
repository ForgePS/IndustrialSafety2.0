import { describe, expect, it } from "vitest";
import { resolvePageBack, shouldShowPageBack } from "./back-navigation";

describe("back-navigation", () => {
  it("hides back only on home", () => {
    expect(shouldShowPageBack("/")).toBe(false);
    expect(shouldShowPageBack("/tasks/")).toBe(true);
    expect(shouldShowPageBack("/more/emergency/")).toBe(true);
  });

  it("resolves tab roots to home", () => {
    expect(resolvePageBack("/tasks/")).toEqual({ href: "/", label: "Home" });
    expect(resolvePageBack("/alerts/")).toEqual({ href: "/", label: "Home" });
    expect(resolvePageBack("/me/")).toEqual({ href: "/", label: "Home" });
  });

  it("resolves nested more routes to Me", () => {
    expect(resolvePageBack("/more/emergency")).toEqual({ href: "/me/", label: "Me" });
    expect(resolvePageBack("/training/")).toEqual({ href: "/tasks/", label: "My Work" });
    expect(resolvePageBack("/loto/abc/")).toEqual({ href: "/more/loto/", label: "LOTO" });
    expect(resolvePageBack("/more/loto/new/")).toEqual({ href: "/more/loto/", label: "LOTO" });
  });
});
