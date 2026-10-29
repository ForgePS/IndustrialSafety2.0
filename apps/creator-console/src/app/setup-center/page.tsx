"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ForgePageHeader, StatusBadge } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { TenantRequired } from "@/components/tenant-required";
import { useTenantId } from "@/hooks/use-tenant-id";
import {
  apiGet,
  listMemberships,
  onboardingListSessions,
  type Membership,
  type OnboardingSessionView,
} from "@/lib/api";
import styles from "../page.module.css";

type Tenant = {
  id: string;
  displayName: string;
  legalName: string;
  status: string;
  timezone?: string;
};

type Branding = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logoDocumentId?: string | null;
  supportEmail?: string | null;
};

type Entitlements = {
  products: Array<{ productCode: string; status: string }>;
  modules: Array<{ moduleCode: string; status: string }>;
};

type NamedRow = { id: string; name?: string | null };

type ChecklistItem = {
  id: string;
  label: string;
  tier: "Required" | "Recommended" | "Optional";
  statusLabel: string;
  done: boolean;
};

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  return [];
}

function SetupCenterInner() {
  const tenantId = useTenantId();
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [facilities, setFacilities] = useState<NamedRow[]>([]);
  const [departments, setDepartments] = useState<NamedRow[]>([]);
  const [positions, setPositions] = useState<NamedRow[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<NamedRow[]>([]);
  const [personnelCount, setPersonnelCount] = useState(0);
  const [fleetCount, setFleetCount] = useState(0);
  const [documents, setDocuments] = useState<NamedRow[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [session, setSession] = useState<OnboardingSessionView | null>(null);
  const [businessConfigured, setBusinessConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const settle = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await promise;
        } catch {
          return fallback;
        }
      };

      const [
        tenantRow,
        brandingRow,
        entitlementsRow,
        facilitiesRow,
        departmentsRow,
        positionsRow,
        employmentTypesRow,
        personnelRow,
        fleetRow,
        documentsRow,
        membersRow,
        sessionsRow,
        businessRow,
      ] = await Promise.all([
        apiGet<Tenant>(`/api/v1/platform/tenants/${tenantId}`),
        settle(apiGet<Branding | null>(`/api/v1/tenants/${tenantId}/branding`), null),
        settle(apiGet<Entitlements>(`/api/v1/tenants/${tenantId}/entitlements`), {
          products: [],
          modules: [],
        }),
        settle(apiGet<unknown>(`/api/v1/tenants/${tenantId}/facilities`), []),
        settle(apiGet<unknown>(`/api/v1/tenants/${tenantId}/industrial/departments`), []),
        settle(apiGet<unknown>(`/api/v1/tenants/${tenantId}/industrial/positions`), []),
        settle(apiGet<unknown>(`/api/v1/tenants/${tenantId}/industrial/employment-types`), []),
        settle(apiGet<unknown>(`/api/v1/tenants/${tenantId}/industrial/personnel`), []),
        settle(apiGet<unknown>(`/api/v1/tenants/${tenantId}/industrial/fleet/vehicles`), []),
        settle(apiGet<unknown>(`/api/v1/tenants/${tenantId}/company-documents`), []),
        settle(listMemberships(tenantId), [] as Membership[]),
        settle(onboardingListSessions(), [] as OnboardingSessionView[]),
        settle(
          apiGet<Array<{ key?: string; value?: unknown }>>(
            `/api/v1/tenants/${tenantId}/configuration/business`,
          ),
          [],
        ),
      ]);

      setTenant(tenantRow);
      setBranding(brandingRow);
      setEntitlements(entitlementsRow);
      setFacilities(asArray<NamedRow>(facilitiesRow));
      setDepartments(asArray<NamedRow>(departmentsRow));
      setPositions(asArray<NamedRow>(positionsRow));
      setEmploymentTypes(asArray<NamedRow>(employmentTypesRow));
      setPersonnelCount(asArray(personnelRow).length);
      setFleetCount(asArray(fleetRow).length);
      setDocuments(asArray<NamedRow>(documentsRow));
      setMembers(membersRow);
      setBusinessConfigured(
        Array.isArray(businessRow)
          ? businessRow.some((row) => row.key === "defaults" || row.value != null)
          : Boolean(businessRow),
      );

      const open = sessionsRow.find(
        (row) =>
          row.session.tenantId === tenantId &&
          row.session.status !== "COMPLETED" &&
          row.session.status !== "CANCELLED",
      );
      setSession(open ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Setup Center.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo<ChecklistItem[]>(() => {
    const products =
      entitlements?.products?.filter((p) => p.status === "ENABLED" || p.status === "ACTIVE") ?? [];
    const modules =
      entitlements?.modules?.filter((m) => m.status === "ENABLED" || m.status === "ACTIVE") ?? [];
    const admins = members;
    const logoUploaded = Boolean(branding?.logoDocumentId);
    const brandingConfigured = Boolean(
      branding &&
      (branding.primaryColor || branding.secondaryColor || branding.supportEmail || logoUploaded),
    );
    const sessionData = session?.session.sessionDataJson ?? {};
    const personnelImported =
      personnelCount > 0 ||
      Boolean((sessionData as { personnelImported?: boolean }).personnelImported);
    const fleetImported =
      fleetCount > 0 || Boolean((sessionData as { fleetImported?: boolean }).fleetImported);
    const activated = tenant?.status === "ACTIVE";

    return [
      {
        id: "profile",
        label: "Company Profile",
        tier: "Required",
        statusLabel: tenant?.displayName ? "Complete" : "Incomplete",
        done: Boolean(tenant?.displayName && tenant?.legalName),
      },
      {
        id: "logo",
        label: "Logo",
        tier: "Recommended",
        statusLabel: logoUploaded ? "Uploaded" : "Not uploaded",
        done: logoUploaded,
      },
      {
        id: "products",
        label: "Products",
        tier: "Required",
        statusLabel: products.length ? `${products.length} configured` : "None",
        done: products.length > 0,
      },
      {
        id: "modules",
        label: "Modules",
        tier: "Required",
        statusLabel: modules.length ? `${modules.length} configured` : "None",
        done: modules.length > 0,
      },
      {
        id: "locations",
        label: "Locations",
        tier: "Required",
        statusLabel: facilities.length ? `${facilities.length} configured` : "None",
        done: facilities.length > 0,
      },
      {
        id: "departments",
        label: "Departments",
        tier: "Recommended",
        statusLabel: departments.length ? `${departments.length} configured` : "None",
        done: departments.length > 0,
      },
      {
        id: "positions",
        label: "Positions",
        tier: "Recommended",
        statusLabel: positions.length ? `${positions.length} configured` : "None",
        done: positions.length > 0,
      },
      {
        id: "employment-types",
        label: "Employment Types",
        tier: "Recommended",
        statusLabel: employmentTypes.length ? `${employmentTypes.length} configured` : "None",
        done: employmentTypes.length > 0,
      },
      {
        id: "admins",
        label: "Administrators",
        tier: "Required",
        statusLabel: admins.length ? `${admins.length} configured` : "None",
        done: admins.length > 0,
      },
      {
        id: "personnel",
        label: "Personnel Imported",
        tier: "Optional",
        statusLabel: personnelImported ? `${personnelCount || "Imported"}` : "Not imported",
        done: personnelImported,
      },
      {
        id: "fleet",
        label: "Fleet Imported",
        tier: "Optional",
        statusLabel: fleetImported ? `${fleetCount || "Imported"}` : "Not imported",
        done: fleetImported,
      },
      {
        id: "documents",
        label: "Documents",
        tier: "Recommended",
        statusLabel: documents.length ? `${documents.length} uploaded` : "None",
        done: documents.length > 0,
      },
      {
        id: "branding",
        label: "Branding",
        tier: "Recommended",
        statusLabel: brandingConfigured ? "Configured" : "Not configured",
        done: brandingConfigured,
      },
      {
        id: "business",
        label: "Business Settings",
        tier: "Recommended",
        statusLabel: businessConfigured ? "Configured" : "Not configured",
        done: businessConfigured,
      },
      {
        id: "activation",
        label: "Activation",
        tier: "Required",
        statusLabel: activated ? "Complete" : (tenant?.status ?? "Pending"),
        done: activated,
      },
    ];
  }, [
    branding,
    businessConfigured,
    departments.length,
    documents.length,
    employmentTypes.length,
    entitlements,
    facilities.length,
    fleetCount,
    members,
    personnelCount,
    positions.length,
    session,
    tenant,
  ]);

  const progressPct = useMemo(() => {
    if (!items.length) return 0;
    const done = items.filter((i) => i.done).length;
    return Math.round((done / items.length) * 100);
  }, [items]);

  if (!tenantId) return <TenantRequired />;

  const continueHref = session
    ? `/onboarding/continue/?sessionId=${encodeURIComponent(session.session.id)}`
    : "/onboarding/new/";
  const ctaLabel = tenant?.status === "ACTIVE" ? "MANAGE SETUP" : "CONTINUE SETUP";

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Company Setup Center"
        subtitle={
          tenant
            ? `${tenant.displayName} · ${progressPct}% complete`
            : "Track onboarding and company setup progress."
        }
        actions={
          <Link className={styles.button} href={continueHref}>
            {ctaLabel}
          </Link>
        }
      />

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading setup checklist…</p> : null}

      <div className={styles.panel} style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge
            tone={progressPct >= 100 ? "success" : progressPct >= 50 ? "info" : "neutral"}
          >
            {progressPct}% complete
          </StatusBadge>
          {tenant ? (
            <StatusBadge tone={tenant.status === "ACTIVE" ? "success" : "info"}>
              {tenant.status}
            </StatusBadge>
          ) : null}
          {session ? <StatusBadge tone="info">Onboarding open</StatusBadge> : null}
        </div>
      </div>

      <div className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Priority</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.label}</td>
                <td>
                  <StatusBadge
                    tone={
                      item.tier === "Required"
                        ? "danger"
                        : item.tier === "Recommended"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {item.tier}
                  </StatusBadge>
                </td>
                <td>
                  <StatusBadge tone={item.done ? "success" : "neutral"}>
                    {item.statusLabel}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.actions} style={{ marginTop: "1rem" }}>
        <Link className={styles.button} href={continueHref}>
          {ctaLabel} →
        </Link>
        <Link
          className={styles.buttonSecondary}
          href={`/tenant-detail/?tenantId=${encodeURIComponent(tenantId)}`}
        >
          Company detail
        </Link>
        <Link
          className={styles.buttonSecondary}
          href={`/imports/?tenantId=${encodeURIComponent(tenantId)}`}
        >
          Data import
        </Link>
      </div>
    </section>
  );
}

export default function SetupCenterPage() {
  return (
    <PlatformPageGate title="Setup Center" permission="platform.tenant.read">
      <Suspense fallback={<p>Loading Setup Center…</p>}>
        <SetupCenterInner />
      </Suspense>
    </PlatformPageGate>
  );
}
