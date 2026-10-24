import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  getWcForms: vi.fn(),
  signWcForm: vi.fn(),
  voidWcForm: vi.fn(),
  emailWcForm: vi.fn(),
  getWcFormRecipients: vi.fn(async () => []),
  fetchBlankWcFormPdf: vi.fn(),
  fetchSignedWcFormPdf: vi.fn(),
}));

vi.mock("@forge/web-kit", () => ({
  ApiError: class ApiError extends Error {},
  apiFetchRaw: vi.fn(),
  apiGet: vi.fn(),
  apiSend: vi.fn(),
}));
vi.mock("@/lib/wc-forms", async () => ({
  ...(await vi.importActual<typeof import("@/lib/wc-forms")>("@/lib/wc-forms")),
  ...api,
}));
// A drawn signature: one click "signs" with a fixed image.
vi.mock("@/components/signature-pad", () => ({
  SignaturePad: ({ label, onChange }: { label: string; onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange("data:image/jpeg;base64,SIG")}>
      {`Sign: ${label}`}
    </button>
  ),
}));

const { WorkersCompFormsPanel } = await import("./workers-comp-forms-panel");

const both = { read: true, act: true };
const overview = (overrides: Record<string, unknown> = {}) => ({
  available: true,
  permissions: { guidelines: both, hipaa: both },
  prefill: { employeeName: "Jordan Lee", dateOfBirth: "1984-03-17" },
  caseArchived: false,
  forms: [
    {
      id: "form-1",
      caseId: "case-1",
      formKey: "INJURY_GUIDELINES_ACK",
      title: "Employee Injury Guidelines",
      status: "SIGNED",
      signerName: "Jordan Lee",
      signerRelationship: "Self",
      signedAt: "2026-10-23T15:00:00Z",
      voidedAt: null,
      voidReason: null,
      emailCount: 1,
      lastEmailedAt: "2026-10-23T16:00:00Z",
    },
  ],
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(<WorkersCompFormsPanel caseId="case-1" caseLabel="WC-14 · Jordan Lee" />);
  });
}

const text = () => container.textContent ?? "";
const button = (label: string | RegExp) =>
  [...container.querySelectorAll("button")].find((b) =>
    typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? ""),
  ) as HTMLButtonElement | undefined;
const input = (id: string) => container.querySelector(`#${id}`) as HTMLInputElement;

function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("WorkersCompFormsPanel", () => {
  it("shows both forms, the signed list and its actions for a medical manager", async () => {
    api.getWcForms.mockResolvedValue(overview());
    await render();
    expect(text()).toContain("Employee Injury Guidelines");
    expect(text()).toContain("HIPAA Authorization");
    expect(container.querySelectorAll("button").length).toBeGreaterThan(4);
    expect(button("Print blank form")).toBeTruthy();
    expect(text()).toContain("Emailed 1 time");
    expect(button("Email")).toBeTruthy();
    expect(button("Void")).toBeTruthy();
  });

  it("hides the HIPAA form and the action buttons from a read-only viewer", async () => {
    api.getWcForms.mockResolvedValue(
      overview({
        permissions: { guidelines: { read: true, act: false }, hipaa: { read: false, act: false } },
      }),
    );
    await render();
    expect(text()).not.toContain("HIPAA Authorization");
    expect(button("Fill out & sign")).toBeUndefined();
    expect(button("Email")).toBeUndefined();
    expect(button("Void")).toBeUndefined();
    expect(button("Print")).toBeTruthy();
  });

  it("says when the forms are not set up for the company", async () => {
    api.getWcForms.mockResolvedValue(overview({ available: false, forms: [] }));
    await render();
    expect(text()).toContain("not set up for this company");
  });

  it("fills and signs the HIPAA authorization", async () => {
    api.getWcForms.mockResolvedValue(overview());
    api.signWcForm.mockResolvedValue({ id: "form-2" });
    await render();

    const fillButtons = [...container.querySelectorAll("button")].filter((b) =>
      b.textContent?.includes("Fill out & sign"),
    );
    await act(async () => fillButtons[1]!.click());
    expect(text()).toContain("HIPAA Authorization Form");
    expect(input("wc-hipaa-name").value).toBe("Jordan Lee");
    expect(input("wc-hipaa-dob").value).toBe("1984-03-17");

    await act(async () => {
      type(input("wc-hipaa-provider"), "Stuttgart Occupational Clinic");
      type(input("wc-hipaa-initial-releaseRecords"), "jl");
    });
    await act(async () => button(/Sign: Signature of patient/)!.click());
    await act(async () => button("Sign authorization")!.click());

    expect(api.signWcForm).toHaveBeenCalledTimes(1);
    const [caseId, formKey, draft, key] = api.signWcForm.mock.calls[0]!;
    expect([caseId, formKey]).toEqual(["case-1", "HIPAA_AUTHORIZATION"]);
    expect(draft).toMatchObject({
      patientName: "Jordan Lee",
      providerName: "Stuttgart Occupational Clinic",
      initials: { releaseRecords: "JL" },
      signatureDataUrl: "data:image/jpeg;base64,SIG",
    });
    expect(typeof key).toBe("string");
    expect(text()).toContain("HIPAA Authorization signed.");
  });

  it("blocks submitting an unsigned acknowledgment", async () => {
    api.getWcForms.mockResolvedValue(overview());
    await render();
    await act(async () => button("Fill out & sign")!.click());
    await act(async () => button("Sign acknowledgment")!.click());
    expect(text()).toContain("The employee needs to sign.");
    expect(api.signWcForm).not.toHaveBeenCalled();
  });

  it("warns about protected health information when emailing a HIPAA form", async () => {
    const hipaa = {
      ...overview().forms[0]!,
      id: "form-3",
      formKey: "HIPAA_AUTHORIZATION",
      title: "HIPAA Authorization",
    };
    api.getWcForms.mockResolvedValue(overview({ forms: [hipaa] }));
    await render();
    await act(async () => button("Email")!.click());
    expect(text()).toContain("protected health information");
    expect(api.getWcFormRecipients).toHaveBeenCalled();
  });
});
