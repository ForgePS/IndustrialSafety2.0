"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@forge/web-kit";
import { EmptyState, LoadingState } from "@/components/field-states";
import { OrgContextBar } from "@/components/org-context-bar";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { FIELD_PRODUCT_NAME } from "@/lib/brand";
import { MY_FORGE_SECTIONS } from "@/lib/my-forge";

function MyForgeInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useAuth();
  const { profile, loading } = useFieldProfile();
  const { featureEnabled } = useFieldPermissions();
  const section = String(search.get("section") ?? "")
    .trim()
    .toLowerCase();
  const activeTenant = me?.tenants?.find((t) => t.tenantId === me.tenantId);

  const sections = useMemo(
    () =>
      MY_FORGE_SECTIONS.filter((item) => {
        if (!item.featureId) return true;
        return featureEnabled(item.featureId);
      }),
    [featureEnabled],
  );

  if (section === "profile") {
    return (
      <>
        <button type="button" className="ff-link-btn" onClick={() => router.push("/my-forge/")}>
          ← My Forge
        </button>
        <h1 className="ff-page-title">My Profile</h1>
        {loading ? <LoadingState label="Loading profile…" /> : null}
        {!loading && !profile ? (
          <EmptyState title="Profile unavailable" message="Try again when you are online." />
        ) : null}
        {profile ? (
          <div className="ff-section">
            <p className="ff-page-body">{profile.displayName}</p>
            {profile.preferredName ? (
              <p className="ff-hint ff-hint--left">Preferred: {profile.preferredName}</p>
            ) : null}
            {activeTenant?.displayName ? (
              <p className="ff-hint ff-hint--left">Company: {activeTenant.displayName}</p>
            ) : null}
            {profile.roles.length > 0 ? (
              <p className="ff-hint ff-hint--left">
                Roles: {profile.roles.map((r) => r.roleName || r.roleCode).join(", ")}
              </p>
            ) : null}
            <p className="ff-hint ff-hint--left" style={{ marginTop: 12 }}>
              Division / Location preferences are set from the Location filters at the top of Me.
            </p>
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              style={{ marginTop: 12 }}
              onClick={() => router.push("/me/")}
            >
              Open Me / settings
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <h1 className="ff-page-title">My Forge</h1>
      <p className="ff-page-body">
        {profile?.displayName || "Your personal area"}
        {activeTenant?.displayName ? ` · ${activeTenant.displayName}` : ""}
      </p>
      <p className="ff-hint ff-hint--left">{FIELD_PRODUCT_NAME}</p>

      <section className="ff-section" aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" className="ff-section-title">
          Division / Location preferences
        </h2>
        <OrgContextBar />
      </section>

      <section className="ff-section" aria-labelledby="forge-heading">
        <h2 id="forge-heading" className="ff-section-title">
          Personal
        </h2>
        <div className="ff-action-grid">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ff-action-tile"
              onClick={() => router.push(item.href)}
            >
              {item.label}
              {item.detail ? <span>{item.detail}</span> : null}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

export function MyForgeHub() {
  return (
    <Suspense fallback={<LoadingState label="Loading My Forge…" />}>
      <MyForgeInner />
    </Suspense>
  );
}
