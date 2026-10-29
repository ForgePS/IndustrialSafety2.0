/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ListControlsView } from "@forge/web-kit";
import { AutosaveIndicator, ConflictDialog } from "@/hooks/use-autosave";
import { SearchableSelect } from "@/components/searchable-select";
import { IncidentHeader, IncidentSectionNav } from "@/components/incident-workspace";

describe("rms-web accessibility", () => {
  it("list controls have no critical axe violations", async () => {
    const { container } = render(
      <ListControlsView
        search=""
        onSearchChange={() => undefined}
        searchLabel="Search incidents"
        sort="created-desc"
        sortOptions={[{ value: "created-desc", label: "Recently created" }]}
        onSortChange={() => undefined}
        page={1}
        pageSize={25}
        total={0}
        onPageChange={() => undefined}
      />,
    );
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it("searchable select exposes combobox semantics", async () => {
    const { container } = render(
      <SearchableSelect
        label="Station"
        selected={null}
        onSearch={async () => [{ id: "1", label: "Station 1", subtitle: "S1" }]}
        onSelect={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(screen.getByRole("combobox", { name: /station/i })).toBeTruthy();
    const results = await axe(container);
    expect(
      results.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);
  });

  it("conflict dialog has titled modal semantics", async () => {
    const { container } = render(
      <ConflictDialog
        open
        message="Version mismatch"
        onReload={() => undefined}
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByRole("dialog", { name: /edit conflict/i })).toBeTruthy();
    const results = await axe(container);
    expect(
      results.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);
  });

  it("incident header and section nav are accessible", async () => {
    const { container } = render(
      <>
        <IncidentHeader
          incidentNumber="2026-00042"
          status="DRAFT"
          autosaveStatus="saved"
          autosaveError={null}
        />
        <IncidentSectionNav
          incidentId="inc-1"
          activeSection="OVERVIEW"
          sections={["OVERVIEW", "CLASSIFICATION", "NARRATIVE", "REVIEW"]}
        />
      </>,
    );
    expect(screen.getByRole("navigation", { name: /incident sections/i })).toBeTruthy();
    const results = await axe(container);
    expect(
      results.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);
  });

  it("autosave indicator announces save states", () => {
    const { unmount: unmountSaving } = render(<AutosaveIndicator status="saving" error={null} />);
    expect(screen.getByText("Saving…")).toBeTruthy();
    unmountSaving();
    render(<AutosaveIndicator status="error" error="Network failed" onRetry={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeTruthy();
    cleanup();
  });
});

describe("rms-web shared helpers", () => {
  it("imports web-kit helpers", async () => {
    const { paginate, totalPages, toIfMatch } = await import("@forge/web-kit");
    expect(paginate([1, 2, 3], 1, 2)).toEqual([1, 2]);
    expect(totalPages(10, 4)).toBe(3);
    expect(toIfMatch(7)).toBe('W/"7"');
  });
});

describe("searchable select keyboard", () => {
  it("selects an option with Enter", async () => {
    const onSelect = vi.fn();
    render(
      <SearchableSelect
        label="Unit"
        selected={null}
        onSearch={async () => [{ id: "u1", label: "Engine 1", subtitle: "ENGINE" }]}
        onSelect={onSelect}
      />,
    );
    const input = screen.getByRole("combobox", { name: /unit/i });
    fireEvent.change(input, { target: { value: "Eng" } });
    await vi.waitFor(() => expect(screen.getByRole("option", { name: /engine 1/i })).toBeTruthy());
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalled();
  });
});
