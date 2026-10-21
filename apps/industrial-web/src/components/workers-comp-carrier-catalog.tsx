"use client";

import { useState, type FormEvent } from "react";
import { ApiError, apiSend } from "@forge/web-kit";
import {
  WC_API,
  workersCompCarrierContact,
  type WorkersCompCarrier,
} from "@/lib/workers-comp-module";

type CarrierFormState = {
  name: string;
  phone: string;
  email: string;
};

const EMPTY_FORM: CarrierFormState = { name: "", phone: "", email: "" };

type Props = {
  carriers: readonly WorkersCompCarrier[];
  canManage: boolean;
  busy?: boolean;
  onChanged: () => Promise<void> | void;
  onError?: (message: string) => void;
  compact?: boolean;
};

/**
 * Admin carrier catalog: add, edit, deactivate, and remove (archive).
 */
export function WorkersCompCarrierCatalog({
  carriers,
  canManage,
  busy = false,
  onChanged,
  onError,
  compact = false,
}: Props) {
  const [form, setForm] = useState<CarrierFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CarrierFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function run(action: () => Promise<void>, fallback: string) {
    setSaving(true);
    try {
      await action();
      await onChanged();
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !form.name.trim()) return;
    await run(async () => {
      await apiSend(`${WC_API}/carriers`, "POST", form);
      setForm(EMPTY_FORM);
    }, "Failed to add carrier");
  }

  function startEdit(carrier: WorkersCompCarrier) {
    const contact = workersCompCarrierContact(carrier);
    setEditingId(carrier.id);
    setEditForm({
      name: carrier.name,
      phone: contact.phone,
      email: contact.email,
    });
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !editingId || !editForm.name.trim()) return;
    await run(async () => {
      await apiSend(`${WC_API}/carriers/${encodeURIComponent(editingId)}`, "PATCH", editForm);
      setEditingId(null);
      setEditForm(EMPTY_FORM);
    }, "Failed to update carrier");
  }

  async function setStatus(carrier: WorkersCompCarrier, status: "ACTIVE" | "INACTIVE") {
    if (!canManage) return;
    await run(async () => {
      await apiSend(`${WC_API}/carriers/${encodeURIComponent(carrier.id)}`, "PATCH", { status });
    }, "Failed to update carrier status");
  }

  async function onRemove(carrier: WorkersCompCarrier) {
    if (!canManage) return;
    const ok = window.confirm(
      `Remove “${carrier.name}” from the carrier catalog? Existing claims keep the name they already have.`,
    );
    if (!ok) return;
    await run(async () => {
      await apiSend(
        `${WC_API}/carriers/${encodeURIComponent(carrier.id)}/archive`,
        "POST",
        {},
      );
      if (editingId === carrier.id) {
        setEditingId(null);
        setEditForm(EMPTY_FORM);
      }
    }, "Failed to remove carrier");
  }

  const disabled = busy || saving;

  return (
    <div>
      {canManage ? (
        <form className={`row g-2 ${compact ? "mb-3" : "mb-4"}`} onSubmit={(e) => void onAdd(e)}>
          <div className={compact ? "col-md-5" : "col-md-4"}>
            <input
              className="form-control"
              placeholder="Carrier name"
              value={form.name}
              disabled={disabled}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className={compact ? "col-md-3" : "col-md-3"}>
            <input
              className="form-control"
              placeholder="Phone"
              value={form.phone}
              disabled={disabled}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          {!compact ? (
            <div className="col-md-3">
              <input
                className="form-control"
                placeholder="Email"
                value={form.email}
                disabled={disabled}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
          ) : null}
          <div className={compact ? "col-md-4" : "col-md-2"}>
            <button type="submit" className="btn btn-primary w-100" disabled={disabled}>
              {compact ? "Add carrier" : "Add"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-muted small">
          Carrier catalog is managed by Industrial admins. Use the Carrier dropdown on each claim to
          select from this list.
        </p>
      )}

      <ul className="list-group list-group-flush">
        {carriers.length === 0 ? (
          <li className="list-group-item text-muted">No carriers yet.</li>
        ) : (
          carriers.map((carrier) => {
            const contact = workersCompCarrierContact(carrier);
            const isEditing = editingId === carrier.id;
            const inactive = (carrier.status || "").toUpperCase() === "INACTIVE";
            return (
              <li className="list-group-item" key={carrier.id}>
                {isEditing ? (
                  <form className="row g-2 align-items-end" onSubmit={(e) => void onSaveEdit(e)}>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor={`carrier-edit-name-${carrier.id}`}>
                        Name
                      </label>
                      <input
                        id={`carrier-edit-name-${carrier.id}`}
                        className="form-control"
                        value={editForm.name}
                        disabled={disabled}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor={`carrier-edit-phone-${carrier.id}`}>
                        Phone
                      </label>
                      <input
                        id={`carrier-edit-phone-${carrier.id}`}
                        className="form-control"
                        value={editForm.phone}
                        disabled={disabled}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor={`carrier-edit-email-${carrier.id}`}>
                        Email
                      </label>
                      <input
                        id={`carrier-edit-email-${carrier.id}`}
                        className="form-control"
                        value={editForm.email}
                        disabled={disabled}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, email: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-md-2 d-flex flex-wrap gap-1">
                      <button type="submit" className="btn btn-sm btn-primary" disabled={disabled}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={disabled}
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(EMPTY_FORM);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                    <div>
                      <div className="fw-medium">{carrier.name}</div>
                      {(contact.phone || contact.email) && (
                        <div className="small text-muted">
                          {[contact.phone, contact.email].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span
                        className={`badge ${inactive ? "bg-label-secondary" : "bg-label-success"}`}
                      >
                        {carrier.status || "ACTIVE"}
                      </span>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={disabled}
                            onClick={() => startEdit(carrier)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-warning"
                            disabled={disabled}
                            onClick={() =>
                              void setStatus(carrier, inactive ? "ACTIVE" : "INACTIVE")
                            }
                          >
                            {inactive ? "Activate" : "Deactivate"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={disabled}
                            onClick={() => void onRemove(carrier)}
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
