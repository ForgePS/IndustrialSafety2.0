"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import {
  canManageInvitations,
  canReadInvitations,
  formatAdminDate,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  type InvitationRow,
} from "@/lib/platform-admin";

type Props = {
  onChanged?: () => void;
};

export function InvitationsPanel({ onChanged }: Props) {
  const { me } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canRead = canReadInvitations(me);
  const canManage = canManageInvitations(me);

  const [items, setItems] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");

  const load = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listInvitations(
        tenantId,
        statusFilter ? { status: statusFilter } : undefined,
      );
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load invitations");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, canRead, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => items.filter((row) => row.status.toUpperCase() === "PENDING").length,
    [items],
  );

  async function onResend(id: string) {
    if (!canManage) return;
    setBusyId(id);
    setError(null);
    try {
      await resendInvitation(id, tenantId);
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resend invitation");
    } finally {
      setBusyId(null);
    }
  }

  async function onRevoke(id: string) {
    if (!canManage) return;
    if (!revokeReason.trim()) {
      setError("Enter a reason before revoking an invitation");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await revokeInvitation(id, tenantId, revokeReason.trim());
      setRevokeReason("");
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke invitation");
    } finally {
      setBusyId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="alert alert-secondary mb-0" role="status">
        You do not have permission to view pending invitations.
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card mb-4">
        <div className="card-body d-flex flex-wrap align-items-center gap-3">
          <div>
            <h6 className="mb-1">Pending invitations</h6>
            <p className="text-muted small mb-0">
              {pendingCount} waiting for users to accept · resend or revoke from here.
            </p>
          </div>
          <label className="ms-auto small text-muted mb-0">
            Show
            <select
              className="form-select form-select-sm d-inline-block w-auto mx-1"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="PENDING">Pending only</option>
              <option value="">All statuses</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="REVOKED">Revoked</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Expires</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="text-muted">
                    Loading invitations…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5}>
                    <AdminEmptyState
                      title="No invitations match this filter"
                      description="Use Add New User on the directory tab to invite someone."
                    />
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.email}</td>
                    <td>{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</td>
                    <td>
                      <span
                        className={`badge ${
                          row.status.toUpperCase() === "PENDING"
                            ? "bg-label-warning"
                            : row.status.toUpperCase() === "ACCEPTED"
                              ? "bg-label-success"
                              : "bg-label-secondary"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="small">{formatAdminDate(row.sentAt ?? row.createdAt)}</td>
                    <td className="small">{formatAdminDate(row.expiresAt)}</td>
                    {canManage ? (
                      <td>
                        {row.status.toUpperCase() === "PENDING" ? (
                          <div className="d-flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={busyId === row.id}
                              onClick={() => void onResend(row.id)}
                            >
                              Resend
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={busyId === row.id}
                              onClick={() => void onRevoke(row.id)}
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <div className="card-footer">
            <label className="small text-muted mb-0">
              Revoke reason (required)
              <input
                className="form-control form-control-sm mt-1"
                value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
                placeholder="e.g. invited wrong email"
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
