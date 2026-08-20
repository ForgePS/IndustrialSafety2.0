"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";

type PendingDoc = {
  documentId: string;
  documentVersionId: string;
  documentKey: string;
  documentTitle: string;
  documentType: string;
  version: string;
  contentHash: string;
};

type Requirements = {
  status: string;
  pendingCount: number;
  pending?: PendingDoc[];
  loginGateEnabled?: boolean;
};

type VersionBody = {
  title: string;
  version: string;
  content: string;
  contentFormat: string;
  effectiveAt: string;
  publishedAt: string | null;
  contentHash: string;
};

export default function LegalAcknowledgePage() {
  const { me, logout, refresh } = useAuth();
  const router = useRouter();
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<VersionBody | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<Requirements>("/api/v1/legal/requirements/current");
        if (cancelled) return;
        setRequirements(data);
        if (data.status !== "REQUIRED" && data.status !== "ACTION_REQUIRED") {
          router.replace("/");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load requirements");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function openDocument(doc: PendingDoc) {
    setLoadingView(true);
    setError(null);
    try {
      const data = await apiGet<VersionBody>(
        `/api/v1/legal/documents/${encodeURIComponent(doc.documentId)}/versions/${encodeURIComponent(doc.documentVersionId)}`,
      );
      setViewing(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load document");
    } finally {
      setLoadingView(false);
    }
  }

  async function onAcknowledge(e: FormEvent) {
    e.preventDefault();
    if (!checked || !requirements?.pending?.length) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend("/api/v1/legal/acknowledgments", "POST", {
        documentVersionIds: requirements.pending.map((p) => p.documentVersionId),
        acceptedAction: "I_ACKNOWLEDGE_AND_CONTINUE",
        source: "LOGIN_GATE",
      });
      if (typeof refresh === "function") await refresh();
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Acknowledgment failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDecline() {
    await logout();
  }

  const pending = requirements?.pending ?? [];

  return (
    <div className="container-xxl py-4" style={{ maxWidth: 820 }}>
      <header className="mb-4">
        <p className="text-uppercase text-muted small mb-1">Forge Industrial Safety</p>
        <h1 className="h3 mb-2">User Access Acknowledgment</h1>
        {me?.tenantId ? (
          <p className="text-muted small mb-0">Authenticated session for your organization.</p>
        ) : null}
      </header>

      <div className="card border shadow-none mb-4">
        <div className="card-body">
          <p>
            By accessing Forge Industrial Safety, I acknowledge that this account is assigned to me
            and is intended only for authorized business use. I agree to protect my login credentials
            and not permit another individual to use my account.
          </p>
          <p>
            I understand that activity performed through my account may be electronically recorded and
            retained, including logins, record creation or modification, approvals, acknowledgments,
            electronic signatures, and administrative actions.
          </p>
          <p>
            I understand that Forge Industrial Safety is a software management and documentation
            platform and does not replace my employer&apos;s safety policies, required training,
            inspections, competent or qualified persons, professional judgment, or compliance
            responsibilities.
          </p>
          <p className="mb-0">
            By selecting &quot;I Acknowledge &amp; Continue,&quot; I confirm that I have reviewed and
            agree to the applicable Terms of Use, Privacy Notice, Acceptable Use Policy, and other
            required policies presented to me.
          </p>
        </div>
      </div>

      <section className="mb-4" aria-labelledby="required-docs-heading">
        <h2 id="required-docs-heading" className="h5">
          Required Documents
        </h2>
        <ul className="list-group list-group-flush border rounded">
          {pending.map((doc) => (
            <li
              key={doc.documentVersionId}
              className="list-group-item d-flex justify-content-between align-items-center gap-2"
            >
              <div>
                <div className="fw-semibold">{doc.documentTitle}</div>
                <div className="small text-muted">Version {doc.version}</div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => void openDocument(doc)}
                disabled={loadingView}
              >
                View
              </button>
            </li>
          ))}
          {pending.length === 0 ? (
            <li className="list-group-item text-muted">Loading required documents…</li>
          ) : null}
        </ul>
        <p className="small text-muted mt-2 mb-0">
          Links open the exact active version applicable to your account.
        </p>
      </section>

      {viewing ? (
        <section className="card border mb-4" aria-label="Document preview">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-start gap-2 mb-3">
              <div>
                <h3 className="h5 mb-1">{viewing.title}</h3>
                <p className="small text-muted mb-0">
                  Version {viewing.version}
                  {viewing.effectiveAt
                    ? ` · Effective ${new Date(viewing.effectiveAt).toLocaleString()}`
                    : ""}
                  {viewing.publishedAt
                    ? ` · Published ${new Date(viewing.publishedAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
            <div
              className="legal-doc-body"
              // Content is platform-authored / sanitized admin HTML from legal_document_versions.
              dangerouslySetInnerHTML={{ __html: viewing.content }}
            />
          </div>
        </section>
      ) : null}

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <form onSubmit={(e) => void onAcknowledge(e)}>
        <div className="form-check mb-3">
          <input
            id="legal-ack-check"
            className="form-check-input"
            type="checkbox"
            checked={checked}
            onChange={(ev) => setChecked(ev.target.checked)}
          />
          <label className="form-check-label" htmlFor="legal-ack-check">
            I have read and acknowledge the above terms.
          </label>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!checked || submitting || pending.length === 0}
          >
            {submitting ? "Saving…" : "I Acknowledge & Continue"}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => void onDecline()}>
            Decline &amp; Sign Out
          </button>
        </div>
      </form>
    </div>
  );
}
