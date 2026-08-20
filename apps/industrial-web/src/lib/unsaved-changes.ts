/**
 * Detect saveable fields and in-app leave navigations for the unsaved-changes guard.
 */

export const UNSAVED_CHANGE_EVENT = "forge-unsaved-change";

const IGNORE_SELECTOR = [
  "[data-unsaved-ignore]",
  "[role=search]",
  ".ind-filter-panel",
  ".ind-tenant-switcher",
  ".layout-navbar",
  ".layout-menu",
  ".authentication-wrapper",
].join(",");

const SAVE_LABEL_RE =
  /\b(save|create|update|add|invite|submit|publish|send|confirm|record)\b/i;
const FILTER_LABEL_RE = /\b(filter|search|clear)\b/i;

export function notifyUnsavedChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UNSAVED_CHANGE_EVENT));
}

export function isIgnoredUnsavedField(el: Element): boolean {
  if (el.closest(IGNORE_SELECTOR)) return true;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (type === "search" || type === "hidden" || type === "button" || type === "reset") {
      return true;
    }
  }
  return false;
}

function buttonLabel(btn: Element): string {
  if (btn instanceof HTMLInputElement) return (btn.value || "").trim();
  return (btn.textContent || "").replace(/\s+/g, " ").trim();
}

function isSubmitControl(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.type === "submit";
  if (!(el instanceof HTMLButtonElement)) return false;
  const type = (el.getAttribute("type") || "submit").toLowerCase();
  return type === "submit";
}

/** True when a form has a submit control whose label is a save/create action. */
export function isSaveableForm(form: HTMLFormElement): boolean {
  if (form.matches(IGNORE_SELECTOR) || form.closest(IGNORE_SELECTOR)) return false;
  if (form.hasAttribute("data-unsaved-track")) return true;
  const controls = form.querySelectorAll("button, input[type=submit]");
  for (const control of controls) {
    if (!isSubmitControl(control)) continue;
    const label = buttonLabel(control);
    if (!label || FILTER_LABEL_RE.test(label)) continue;
    if (SAVE_LABEL_RE.test(label)) return true;
  }
  return false;
}

export function saveableFormForField(el: Element): HTMLFormElement | null {
  if (isIgnoredUnsavedField(el)) return null;
  const form = el.closest("form");
  if (form instanceof HTMLFormElement && isSaveableForm(form)) return form;
  return null;
}

export function shouldTrackUnsavedField(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  if (isIgnoredUnsavedField(el)) return false;
  if (el.closest("[data-unsaved-track]")) return true;
  return saveableFormForField(el) !== null;
}

export function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function resolveAnchorHref(anchor: HTMLAnchorElement, baseHref: string): string | null {
  const raw = anchor.getAttribute("href");
  if (raw == null || raw === "" || raw.startsWith("javascript:")) return null;
  if (anchor.hasAttribute("download")) return null;
  const target = (anchor.getAttribute("target") || "").toLowerCase();
  if (target === "_blank") return null;
  try {
    return new URL(raw, baseHref).href;
  } catch {
    return null;
  }
}

/** True when following `toHref` would leave the current document view. */
export function isLeaveNavigation(fromHref: string, toHref: string): boolean {
  let from: URL;
  let to: URL;
  try {
    from = new URL(fromHref);
    to = new URL(toHref);
  } catch {
    return true;
  }
  if (from.origin !== to.origin) return true;
  if (from.pathname !== to.pathname) return true;
  if (from.search !== to.search) return true;
  return false;
}
