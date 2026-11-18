import { useState, type ReactNode } from "react";
import { FxButton, FxDialog, FxTextField, FxAlert } from "@forge/fx-ui";

/** Reference pattern: confirm destructive delete — no production APIs. */
export function DeleteRecordPattern({
  recordTitle,
  onConfirm,
}: {
  recordTitle: string;
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FxButton tone="danger" onClick={() => setOpen(true)}>
        Delete
      </FxButton>
      <FxDialog
        open={open}
        title="Delete record?"
        onClose={() => setOpen(false)}
        actions={
          <>
            <FxButton tone="secondary" onClick={() => setOpen(false)}>
              Cancel
            </FxButton>
            <FxButton
              tone="danger"
              onClick={() => {
                onConfirm?.();
                setOpen(false);
              }}
            >
              Delete permanently
            </FxButton>
          </>
        }
      >
        <p>
          This will delete <strong>{recordTitle}</strong>. This action cannot be undone in the
          reference prototype.
        </p>
      </FxDialog>
    </>
  );
}

/** Reference pattern: simple create form with validation summary. */
export function CreateRecordPattern({ onSubmit }: { onSubmit?: (title: string) => void }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) {
          setError("Title is required.");
          return;
        }
        setError(undefined);
        onSubmit?.(title.trim());
      }}
      style={{ display: "grid", gap: "var(--fx-space-16)", maxWidth: 480 }}
    >
      {error ? <FxAlert tone="danger" title="Fix the following" children={error} /> : null}
      <FxTextField
        id="fx-create-title"
        label="Title"
        required
        value={title}
        error={error}
        onChange={(e) => setTitle(e.target.value)}
      />
      <FxButton type="submit">Create draft</FxButton>
    </form>
  );
}

export function PatternFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} style={{ display: "grid", gap: "var(--fx-space-12)" }}>
      <h2 style={{ margin: 0, fontFamily: "var(--fx-font-display)", fontSize: 20 }}>{title}</h2>
      {children}
    </section>
  );
}
