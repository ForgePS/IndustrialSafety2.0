"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { sanitizeLegalHtml } from "@/lib/sanitize-legal-html";

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
  const { logout, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => {
    const raw = searchParams.get("next");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  }, [searchParams]);
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docBodies, setDocBodies] = useState<Record<string, VersionBody>>({});
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<Requirements>("/api/v1/legal/requirements/current");
        if (cancelled) return;
        setRequirements(data);
        if (data.status !== "REQUIRED" && data.status !== "ACTION_REQUIRED") {
          router.replace(nextPath);
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
  }, [router, nextPath]);

  const pending = useMemo(() => requirements?.pending ?? [], [requirements?.pending]);

  useEffect(() => {
    if (pending.length === 0) return;
    let cancelled = false;
    setLoadingDocs(true);
    void (async () => {
      try {
        const entries = await Promise.all(
          pending.map(async (doc) => {
            const body = await apiGet<VersionBody>(
              `/api/v1/legal/documents/${encodeURIComponent(doc.documentId)}/versions/${encodeURIComponent(doc.documentVersionId)}`,
            );
            return [doc.documentVersionId, body] as const;
          }),
        );
        if (cancelled) return;
        setDocBodies(Object.fromEntries(entries));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load required documents");
        }
      } finally {
        if (!cancelled) setLoadingDocs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending]);

  async function onAcknowledge(e: FormEvent) {
    e.preventDefault();
    if (!checked || pending.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend("/api/v1/legal/acknowledgments", "POST", {
        documentVersionIds: pending.map((p) => p.documentVersionId),
        acceptedAction: "I_ACKNOWLEDGE_AND_CONTINUE",
        source: "LOGIN_GATE",
      });
      if (typeof refresh === "function") await refresh();
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Acknowledgment failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDecline() {
    await logout();
  }

  return (
    <div className="container-xxl py-4 legal-acknowledge-page" style={{ maxWidth: 820 }}>
      <header className="mb-4">
        <p className="text-uppercase text-muted small mb-2">Forge Industrial Safety</p>
        <h1 className="h3 mb-2">User Access Acknowledgment</h1>
        <p className="text-muted mb-0">
          Review each required document below. Paragraphs and policy sections are spaced for
          readability. You must acknowledge all listed items to continue.
        </p>
      </header>

      <section className="mb-4" aria-labelledby="required-docs-heading">
        <h2 id="required-docs-heading" className="h5 mb-3">
          Required Documents
        </h2>

        {loadingDocs && pending.length > 0 ? (
          <p className="text-muted small mb-3" role="status">
            Loading required documents…
          </p>
        ) : null}

        {pending.length === 0 ? (
          <p className="text-muted">Loading required documents…</p>
        ) : (
          <div className="required-doc-list">
            {pending.map((doc) => {
              const body = docBodies[doc.documentVersionId];
              return (
                <article
                  key={doc.documentVersionId}
                  className="card border shadow-none required-doc-card"
                >
                  <div className="card-header bg-transparent border-bottom py-3">
                    <h3 className="h6 mb-1">{doc.documentTitle}</h3>
                    <p className="small text-muted mb-0">Version {doc.version}</p>
                  </div>
                  <div className="card-body py-4">
                    {body ? (
                      <div
                        className="legal-doc-body"
                        // Platform-authored legal HTML from legal_document_versions.
                        dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(body.content) }}
                      />
                    ) : (
                      <p className="text-muted small mb-0">Document content could not be loaded.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="small text-muted mt-3 mb-0">
          Each block shows the exact active version applicable to your account.
        </p>
      </section>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <form onSubmit={(e) => void onAcknowledge(e)} className="mt-4">
        <div className="form-check mb-3">
          <input
            id="legal-ack-check"
            className="form-check-input"
            type="checkbox"
            checked={checked}
            onChange={(ev) => setChecked(ev.target.checked)}
          />
          <label className="form-check-label" htmlFor="legal-ack-check">
            I have read and acknowledge each required document above.
          </label>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!checked || submitting || pending.length === 0 || loadingDocs}
          >
            {submitting ? "Saving…" : "I Acknowledge & Continue"}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => void onDecline()}
          >
            Decline &amp; Sign Out
          </button>
        </div>
      </form>
    </div>
  );
}
