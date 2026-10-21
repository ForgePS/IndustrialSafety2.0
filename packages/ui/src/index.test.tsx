/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  Can,
  Checkbox,
  ForgeCommandPalette,
  ForgeFacilitySelector,
  ForgePage,
  ForgePageHeader,
  ForgePagePanel,
  ForgeSearchTrigger,
  ForgeShellState,
  Input,
} from "./index.js";

afterEach(() => cleanup());

describe("ui accessibility", () => {
  it("renders input with accessible label", () => {
    render(<Input id="email" label="Email address" />);
    expect(screen.getByLabelText("Email address")).toBeTruthy();
  });

  it("Can hides children when not allowed", () => {
    render(
      <Can allowed={false} fallback={<span>denied</span>}>
        <span>secret</span>
      </Can>,
    );
    expect(screen.getByText("denied")).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("renders page header title", () => {
    render(<ForgePageHeader title="Creator Console" subtitle="Ops" />);
    expect(screen.getByRole("heading", { name: "Creator Console" })).toBeTruthy();
  });
});

describe("CREATOR-UX-REPAIR checkbox row", () => {
  it("associates label click with checkbox and keeps adjacent structure", () => {
    const onChange = vi.fn();
    render(
      <Checkbox
        id="cutover-validation"
        label="Validation complete and reviewed"
        description="Required before cutover"
        onChange={onChange}
      />,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: /Validation complete and reviewed/,
    }) as HTMLInputElement;
    expect(checkbox.id).toBe("cutover-validation");
    expect(checkbox.closest("label")?.className).toContain("forge-checkbox-row");
    expect(screen.queryByText(/\(flag off\)/i)).toBeNull();
    fireEvent.click(screen.getByText("Validation complete and reviewed"));
    expect(onChange).toHaveBeenCalled();
  });

  it("renders page container contract classes", () => {
    const { container } = render(
      <ForgePage>
        <ForgePagePanel>
          <span>panel</span>
        </ForgePagePanel>
      </ForgePage>,
    );
    expect(container.querySelector(".forge-page")).toBeTruthy();
    expect(container.querySelector(".forge-page__panel")).toBeTruthy();
  });
});

describe("MK-S8 shell chrome", () => {
  it("renders nothing when facilities are empty", () => {
    const { container } = render(<ForgeFacilitySelector facilities={[]} state="empty" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders disabled search trigger", () => {
    render(<ForgeSearchTrigger />);
    const btn = screen.getByRole("button", { name: "Search" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables search trigger when connected", () => {
    render(<ForgeSearchTrigger disabled={false} onTrigger={() => undefined} />);
    const btn = screen.getByRole("button", { name: "Search" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("renders command palette items when open", () => {
    const onSelect = vi.fn();
    render(
      <ForgeCommandPalette
        open
        onClose={() => undefined}
        query=""
        onQueryChange={() => undefined}
        items={[{ id: "1", group: "Navigate", label: "Members", subtitle: "/members" }]}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Search" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Members/ })).toBeTruthy();
  });

  it("renders shell loading / unauthorized / disabled entitlement states", () => {
    const { rerender } = render(<ForgeShellState state="loading" title="Loading shell…" />);
    expect(screen.getByText("Loading shell…")).toBeTruthy();

    rerender(<ForgeShellState state="unauthorized" title="Unauthorized" description="Denied" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Unauthorized")).toBeTruthy();

    rerender(
      <ForgeShellState state="disabled_entitlement" title="Not entitled" description="Module off" />,
    );
    expect(screen.getByText("Not entitled")).toBeTruthy();
    expect(screen.getByText("Module off")).toBeTruthy();
  });
});
