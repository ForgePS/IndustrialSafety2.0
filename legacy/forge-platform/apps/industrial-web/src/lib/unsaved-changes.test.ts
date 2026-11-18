import { describe, expect, it } from "vitest";
import {
  isLeaveNavigation,
  isSaveableForm,
  resolveAnchorHref,
  shouldTrackUnsavedField,
} from "./unsaved-changes";

describe("isSaveableForm", () => {
  it("treats Save / Create submit buttons as saveable", () => {
    document.body.innerHTML = `<form id="f"><button type="submit">Save person</button></form>`;
    expect(isSaveableForm(document.querySelector("form")!)).toBe(true);
    document.body.innerHTML = `<form><button type="submit">Create draft</button></form>`;
    expect(isSaveableForm(document.querySelector("form")!)).toBe(true);
  });

  it("ignores filter forms", () => {
    document.body.innerHTML = `<form><button type="submit">Apply filters</button></form>`;
    expect(isSaveableForm(document.querySelector("form")!)).toBe(false);
  });
});

describe("shouldTrackUnsavedField", () => {
  it("tracks inputs inside saveable forms", () => {
    document.body.innerHTML = `<form><input id="name"><button type="submit">Save</button></form>`;
    expect(shouldTrackUnsavedField(document.getElementById("name"))).toBe(true);
  });

  it("ignores search and filter-panel fields", () => {
    document.body.innerHTML = `
      <div class="ind-filter-panel"><form><input id="q" type="search"><button type="submit">Save</button></form></div>
    `;
    expect(shouldTrackUnsavedField(document.getElementById("q"))).toBe(false);
    document.body.innerHTML = `<form role="search"><select id="sort"><option>A</option></select><button type="submit">Save person</button></form>`;
    expect(shouldTrackUnsavedField(document.getElementById("sort"))).toBe(false);
  });

  it("tracks fields marked data-unsaved-track", () => {
    document.body.innerHTML = `<div data-unsaved-track><textarea id="notes"></textarea></div>`;
    expect(shouldTrackUnsavedField(document.getElementById("notes"))).toBe(true);
  });
});

describe("isLeaveNavigation", () => {
  it("treats path or query changes as leaving", () => {
    expect(
      isLeaveNavigation(
        "https://app.example/modules/personnel/",
        "https://app.example/modules/fleet/",
      ),
    ).toBe(true);
    expect(
      isLeaveNavigation(
        "https://app.example/modules/personnel/",
        "https://app.example/modules/personnel/?view=archived",
      ),
    ).toBe(true);
  });

  it("allows hash-only changes", () => {
    expect(
      isLeaveNavigation(
        "https://app.example/modules/personnel/",
        "https://app.example/modules/personnel/#top",
      ),
    ).toBe(false);
  });
});

describe("resolveAnchorHref", () => {
  it("skips new tabs and javascript urls", () => {
    const a = document.createElement("a");
    a.href = "/modules/fleet/";
    a.target = "_blank";
    expect(resolveAnchorHref(a, "https://app.example/")).toBeNull();
    a.removeAttribute("target");
    a.setAttribute("href", "javascript:void(0)");
    expect(resolveAnchorHref(a, "https://app.example/")).toBeNull();
  });
});
