"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import {
  canManageConfiguration,
  canPublishConfiguration,
} from "@/lib/platform-admin";
import {
  getEffectivePayload,
  loadConfigNamespace,
  saveAndPublishNamespace,
  saveNamespaceDraft,
  type TenantProfilePayload,
} from "@/lib/settings-config";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default function SettingsCompanyProfilePage() {
  const { me, loading: authLoading } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canEdit = canManageConfiguration(me);
  const canPublish = canPublishConfiguration(me);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [locale, setLocale] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notes, setNotes] = useState("");

  const applyPayload = useCallback((payload: TenantProfilePayload) => {
    setDisplayName(asString(payload.displayName));
    setLegalName(asString(payload.legalName));
    setTimezone(asString(payload.timezone));
    setLocale(asString(payload.locale));
    setContactEmail(asString(payload.contactEmail));
    setNotes(asString(payload.notes));
  }, []);

  const load = useCallback(async () => {
    if (!tenantId || !canEdit) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { draft } = await loadConfigNamespace(tenantId, "tenant_profile");
      if (draft?.payloadJson && typeof draft.payloadJson === "object") {
        applyPayload(draft.payloadJson as TenantProfilePayload);
        setDraftState(`DRAFT v${draft.version}`);
      } else {
        const effective = await getEffectivePayload<TenantProfilePayload>(
          tenantId,
          "tenant_profile",
        );
        applyPayload(effective);
        setDraftState(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load company profile");
    } finally {
      setLoading(false);
    }
  }, [tenantId, canEdit, applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildPayload(): TenantProfilePayload {
    const payload: TenantProfilePayload = {};
    if (displayName.trim()) payload.displayName = displayName.trim();
    if (legalName.trim()) payload.legalName = legalName.trim();
    if (timezone.trim()) payload.timezone = timezone.trim();
    if (locale.trim()) payload.locale = locale.trim();
    if (contactEmail.trim()) payload.contactEmail = contactEmail.trim();
    if (notes.trim()) payload.notes = notes.trim();
    return payload;
  }

  async function onSaveDraft(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !canEdit) return;
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveNamespaceDraft(
        tenantId,
        "tenant_profile",
        "Tenant Profile",
        buildPayload(),
        changeSummary.trim() || "Company profile draft from Industrial Settings",
      );
      setMessage("Draft saved.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save draft");
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!tenantId || !canPublish) return;
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    if (!window.confirm("Publish company profile now?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveAndPublishNamespace(
        tenantId,
        "tenant_profile",
        "Tenant Profile",
        buildPayload(),
        changeSummary.trim() || "Publish company profile from Industrial Settings",
      );
      setMessage("Company profile published.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <p className="text-muted mb-0">Loading company profile…</p>;
  }

  if (!canEdit) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        You need configuration update permission to edit the company profile.
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <p className="settings-admin-sidebar__eyebrow mb-2">Organization</p>
        <h1 className="h4 mb-1">Company profile</h1>
        <p className="text-muted mb-0">
          Legal identity and contact defaults for this tenant. Published through Configuration
          Studio.
        </p>
        {draftState ? (
          <p className="small text-primary mt-2 mb-0">Working copy: {draftState}</p>
        ) : (
          <p className="small text-muted mt-2 mb-0">Editing published values (save creates a draft).</p>
        )}
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}

      <form className="card border shadow-none" onSubmit={onSaveDraft}>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label" htmlFor="profile-display-name">
                Display name
              </label>
              <input
                id="profile-display-name"
                className="form-control"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="profile-legal-name">
                Legal name
              </label>
              <input
                id="profile-legal-name"
                className="form-control"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="profile-timezone">
                Timezone
              </label>
              <input
                id="profile-timezone"
                className="form-control"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="America/Chicago"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="profile-locale">
                Locale
              </label>
              <input
                id="profile-locale"
                className="form-control"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                placeholder="en-US"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="profile-contact-email">
                Contact email
              </label>
              <input
                id="profile-contact-email"
                className="form-control"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="profile-notes">
                Notes
              </label>
              <textarea
                id="profile-notes"
                className="form-control"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="profile-summary">
                Change summary
              </label>
              <input
                id="profile-summary"
                className="form-control"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="Why this change?"
              />
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 mt-4">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save draft"}
            </button>
            {canPublish ? (
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={busy}
                onClick={() => void onPublish()}
              >
                Publish
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </>
  );
}
