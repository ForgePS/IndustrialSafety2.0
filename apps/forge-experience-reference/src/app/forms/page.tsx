"use client";

import { useEffect, useState } from "react";
import { FxBreadcrumb } from "@forge/fx-layouts";
import { FxAlert, FxButton, FxCard, FxTextField } from "@forge/fx-ui";

const STEPS = ["Details", "Attachments", "Review", "Complete"];

export default function FormsPage() {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const t = window.setTimeout(() => setDraftNote("Draft auto-saved locally (demo)"), 1200);
    return () => window.clearTimeout(t);
  }, [title, step]);

  return (
    <>
      <FxBreadcrumb items={[{ label: "Forms" }, { label: "Wizard prototype" }]} />
      <h1 style={{ fontFamily: "var(--fx-font-display)", fontSize: 28 }}>Forms prototype</h1>
      <p className="fx-card__body">
        Demonstrates single-page fields, wizard steps, validation, auto-save affordance, review and
        completion — no production APIs.
      </p>
      <div
        style={{ display: "flex", gap: "var(--fx-space-8)", margin: "var(--fx-space-16) 0" }}
        role="list"
      >
        {STEPS.map((s, i) => (
          <span
            key={s}
            role="listitem"
            className="fx-badge fx-badge--neutral"
            aria-current={i === step ? "step" : undefined}
            style={i === step ? { borderColor: "var(--fx-color-action-primary)" } : undefined}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>
      {draftNote ? (
        <p className="fx-field__hint" role="status">
          {draftNote}
        </p>
      ) : null}
      <FxCard title={STEPS[step] ?? "Step"}>
        {step === 0 && (
          <div style={{ display: "grid", gap: "var(--fx-space-16)", maxWidth: 480 }}>
            {error ? (
              <FxAlert tone="danger" title="Validation">
                {error}
              </FxAlert>
            ) : null}
            <FxTextField
              id="form-title"
              label="Record title"
              required
              value={title}
              error={error}
              onChange={(e) => setTitle(e.target.value)}
            />
            <FxTextField
              id="form-notes"
              label="Notes"
              hint="Conditional sections would appear based on product rules."
            />
          </div>
        )}
        {step === 1 && (
          <p>
            Attachment / signature / QR scanner slots go here using FX form controls. Offline draft
            banner would show when disconnected.
          </p>
        )}
        {step === 2 && (
          <FxAlert tone="info" title="Review">
            Title: {title || "(empty)"} — confirm before completion.
          </FxAlert>
        )}
        {step === 3 && (
          <FxAlert tone="success" title="Completion screen">
            Reference completion state. Approval screen would use shared Approve/Reject pattern.
          </FxAlert>
        )}
        <div style={{ display: "flex", gap: "var(--fx-space-8)", marginTop: "var(--fx-space-24)" }}>
          <FxButton tone="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </FxButton>
          <FxButton
            onClick={() => {
              if (step === 0 && !title.trim()) {
                setError("Title is required.");
                return;
              }
              setError(undefined);
              setStep((s) => Math.min(STEPS.length - 1, s + 1));
            }}
          >
            {step === STEPS.length - 1 ? "Done" : "Next"}
          </FxButton>
        </div>
      </FxCard>
    </>
  );
}
