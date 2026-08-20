"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiGetResult, apiSend, toIfMatch, useAuth } from "@forge/web-kit";
import { SignaturePad } from "@/components/signature-pad";
import { YearSelectDateInput } from "@/components/year-select-date-input";
import { personFileHref } from "@/lib/personnel-directory";
import { canEditMyProfile, profileInitials } from "@/lib/my-profile";
import { isAcceptableSignature, isOversizedSignature } from "@/lib/personnel-form";

type ProfileRole = { roleCode: string; roleName: string };

type AuthProfile = {
  userId: string;
  tenantId: string;
  username: string | null;
  accountEmail: string;
  status: string;
  lastLoginAt: string | null;
  personId: string | null;
  personnelId: string | null;
  signatureUrl: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  preferredName: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  recordVersion: number;
  roles: ProfileRole[];
  isPlatformAdmin: boolean;
  canEdit: boolean;
};

type ProfileForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  preferredName: string;
  username: string;
  email: string;
  phone: string;
  dateOfBirth: string;
};

function emptyForm(): ProfileForm {
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    preferredName: "",
    username: "",
    email: "",
    phone: "",
    dateOfBirth: "",
  };
}

function formFromProfile(profile: AuthProfile): ProfileForm {
  return {
    firstName: profile.firstName ?? "",
    middleName: profile.middleName ?? "",
    lastName: profile.lastName ?? "",
    suffix: profile.suffix ?? "",
    preferredName: profile.preferredName ?? "",
    username: profile.username ?? "",
    email: profile.email ?? profile.accountEmail ?? "",
    phone: profile.phone ?? "",
    dateOfBirth: profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : "",
  };
}

function roleLabel(profile: AuthProfile): string {
  if (profile.isPlatformAdmin) return "Super Admin";
  const names = profile.roles.map((role) => role.roleName || role.roleCode).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Tenant member";
}

/**
 * Signed-in user profile. The user can always edit their own record; Admin,
 * Super Admin, and Creator can as well. Saves through /api/v1/auth/profile so
 * a linked platform person is created when one does not exist yet.
 */
export default function IndustrialProfilePage() {
  const { me, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [signature, setSignature] = useState("");
  const [etag, setEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);

  const canEdit = canEditMyProfile(me, me?.userId) && (profile?.canEdit ?? true);

  const loadProfile = useCallback(async () => {
    if (!me?.userId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const result = await apiGetResult<AuthProfile>("/api/v1/auth/profile");
      setProfile(result.data);
      setForm(formFromProfile(result.data));
      setSignature(result.data.signatureUrl ?? "");
      setEtag(result.etag ?? toIfMatch(result.data.recordVersion));
      setSignatureSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [me?.userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    setSignatureSaved(false);
    try {
      const updated = await apiSend<AuthProfile>("/api/v1/auth/profile", "PATCH", {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        middleName: form.middleName.trim() || null,
        suffix: form.suffix.trim() || null,
        preferredName: form.preferredName.trim() || null,
        username: form.username.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        dateOfBirth: form.dateOfBirth.trim() || null,
      }, etag ? { ifMatch: etag } : {});
      setProfile(updated);
      setForm(formFromProfile(updated));
      setSignature(updated.signatureUrl ?? "");
      setEtag(toIfMatch(updated.recordVersion));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveSignature() {
    if (!canEdit || !profile?.personnelId) return;
    const next = signature.trim();
    if (!isAcceptableSignature(next)) {
      setError(
        isOversizedSignature(next)
          ? "Signature is too large. Clear and sign again with a simpler stroke."
          : "Signature must be drawn on the pad or cleared.",
      );
      return;
    }
    setSavingSignature(true);
    setError(null);
    setSaved(false);
    setSignatureSaved(false);
    try {
      const updated = await apiSend<AuthProfile>(
        "/api/v1/auth/profile",
        "PATCH",
        {
          firstName: form.firstName.trim() || profile.firstName,
          lastName: form.lastName.trim() || profile.lastName,
          middleName: form.middleName.trim() || null,
          suffix: form.suffix.trim() || null,
          preferredName: form.preferredName.trim() || null,
          username: form.username.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          dateOfBirth: form.dateOfBirth.trim() || null,
          signatureUrl: next,
        },
        etag ? { ifMatch: etag } : {},
      );
      setProfile(updated);
      setForm(formFromProfile(updated));
      setSignature(updated.signatureUrl ?? "");
      setEtag(toIfMatch(updated.recordVersion));
      setSignatureSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save signature");
    } finally {
      setSavingSignature(false);
    }
  }

  if (authLoading) {
    return (
      <div className="ind-content">
        <h1>My profile</h1>
        <p className="ind-muted">Loading session…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="ind-content">
        <h1>My profile</h1>
        <p className="ind-error">Sign in to view your profile.</p>
      </div>
    );
  }

  const initials = profileInitials({
    firstName: form.firstName || profile?.firstName || null,
    lastName: form.lastName || profile?.lastName || null,
    displayName: profile?.displayName ?? null,
    accountEmail: profile?.accountEmail ?? null,
    isPlatformAdmin: me.isPlatformAdmin,
    userId: me.userId,
  });

  return (
    <div className="ind-content ind-profile">
      <div className="d-flex flex-wrap align-items-center gap-3 mb-4">
        <span className="avatar avatar-md">
          <span className="avatar-initial rounded-circle bg-label-primary">{initials}</span>
        </span>
        <div>
          <h1 className="mb-1">My profile</h1>
          <p className="text-muted mb-0">
            {canEdit
              ? "Update your name and contact details. Changes save to your account on this tenant."
              : profile && !profile.accountEmail
                ? "This session is not a member of the active tenant, so contact details cannot be edited here."
                : "You can view this profile. Ask an administrator if you need changes."}
          </p>
          <p className="mt-2 mb-0">
            <Link href="/profile/legal/" className="small">
              Legal &amp; Acknowledgments
            </Link>
          </p>
        </div>
      </div>

      {error ? (
        <p className="ind-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-success mb-3" role="status">
          Profile saved.
        </p>
      ) : null}
      {signatureSaved ? (
        <p className="text-success mb-3" role="status">
          Signature saved. Forms can use it via &quot;Use my signature&quot;.
        </p>
      ) : null}

      <div className="card mb-4">
        <div className="card-body">
          <h2 className="h6">Account</h2>
          <dl className="ind-profile-dl mb-0">
            <div>
              <dt>Sign-in email</dt>
              <dd>{profile?.accountEmail || "—"}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{profile ? roleLabel(profile) : me.isPlatformAdmin ? "Platform admin" : "Tenant member"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{profile?.status || "—"}</dd>
            </div>
            <div>
              <dt>Last sign-in</dt>
              <dd>
                {profile?.lastLoginAt
                  ? new Date(profile.lastLoginAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Active tenant</dt>
              <dd className="font-monospace small">{me.tenantId ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {loading && !profile ? (
        <p className="ind-muted" role="status">
          Loading profile…
        </p>
      ) : (
        <div className="card">
          <div className="card-body">
            <h2 className="h6 mb-1">{profile?.displayName || "Contact details"}</h2>
            <p className="text-muted small mb-3">
              {profile?.personnelId ? (
                <>
                  Linked to a personnel record.{" "}
                  <Link href={personFileHref(profile.personnelId)}>
                    Open personnel file
                  </Link>
                </>
              ) : (
                "Name and contact used across Industrial Safety."
              )}
            </p>
            <form className="ind-ops-create border-0 shadow-none p-0" onSubmit={(e) => void onSave(e)}>
              {(
                [
                  ["firstName", "First name", true, "text"],
                  ["lastName", "Last name", true, "text"],
                  ["middleName", "Middle name", false, "text"],
                  ["suffix", "Suffix", false, "text"],
                  ["preferredName", "Preferred name", false, "text"],
                  ["username", "Username", false, "text"],
                  ["email", "Contact email", false, "email"],
                  ["phone", "Phone", false, "tel"],
                  ["dateOfBirth", "Date of birth", false, "date"],
                ] as const
              ).map(([key, label, required, type]) => (
                <label key={key}>
                  {label}
                  {type === "date" ? (
                    <YearSelectDateInput
                      id={`profile-${key}`}
                      value={form[key]}
                      onChange={(next) => setForm((prev) => ({ ...prev, [key]: next }))}
                      required={required}
                      disabled={!canEdit || saving}
                      mode="birth"
                    />
                  ) : (
                    <input
                      type={type}
                      required={required}
                      disabled={!canEdit || saving}
                      value={form[key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      autoComplete={
                        key === "email" ? "email" : key === "phone" ? "tel" : key === "username" ? "username" : "off"
                      }
                    />
                  )}
                </label>
              ))}
              {canEdit ? (
                <div className="d-flex flex-wrap gap-2">
                  <button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save profile"}
                  </button>
                  <button type="button" disabled={saving} onClick={() => void loadProfile()}>
                    Reset
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      )}

      {profile ? (
        <div className="card mt-4">
          <div className="card-body">
            <h2 className="h6 mb-1">Signature on file</h2>
            <p className="text-muted small mb-3">
              {profile.personnelId
                ? "Saved to your linked personnel record. When filling forms, choose \"Use my signature\" to apply it."
                : "Your account is not linked to a personnel record yet, so a reusable signature cannot be stored."}
            </p>
            {profile.personnelId ? (
              <>
                <SignaturePad
                  label="My signature"
                  value={signature}
                  onChange={setSignature}
                  disabled={!canEdit || savingSignature}
                />
                {canEdit ? (
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      disabled={savingSignature || saving}
                      onClick={() => void onSaveSignature()}
                    >
                      {savingSignature ? "Saving…" : "Save signature"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="mt-3 mb-0">
        <Link href="/">← Dashboard</Link>
        {" · "}
        <Link href="/settings/">Settings</Link>
      </p>
    </div>
  );
}
