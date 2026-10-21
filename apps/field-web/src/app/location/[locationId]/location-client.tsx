"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { EmptyState, LoadingState } from "@/components/field-states";
import { isFieldFeatureModuleEnabled } from "@/lib/field-modules";

function LocationInner() {
  const params = useParams<{ locationId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const org = useFieldOrgOptional();
  const { activeModules, opts } = useFieldPermissions();
  const applied = useRef(false);
  const id = String(params?.locationId ?? "").trim();
  const kindRaw = String(search.get("kind") ?? "location").toLowerCase();
  const kind =
    kindRaw === "division" ? "division" : kindRaw === "department" ? "department" : "location";

  const knownName = useMemo(() => {
    if (!org || !id || id === "placeholder") return "";
    if (kind === "division") return id;
    if (kind === "department") {
      return org.departments.find((d) => d.id === id)?.name ?? "";
    }
    return org.locations.find((l) => l.id === id)?.name ?? org.selection.locationName;
  }, [org, id, kind]);

  useEffect(() => {
    if (!org || !id || id === "placeholder" || applied.current) return;
    applied.current = true;
    if (kind === "department") {
      org.applyScanOrgContext({
        locationId: org.selection.locationId || id,
        locationName: org.selection.locationName,
        divisionName: org.selection.divisionName,
        departmentId: id,
        departmentName: knownName || id,
        kind: "department",
      });
      return;
    }
    if (kind === "division") {
      org.applyScanOrgContext({
        locationId: org.selection.locationId,
        locationName: org.selection.locationName,
        divisionName: knownName || id,
        kind: "division",
      });
      return;
    }
    org.applyScanOrgContext({
      locationId: id,
      locationName: knownName || id,
      kind: "location",
    });
  }, [org, id, kind, knownName]);

  if (!id || id === "placeholder") {
    return (
      <EmptyState
        title="Scan a Location QR"
        message="Scanning a Location QR sets your active working context."
      />
    );
  }

  const title =
    kind === "division" ? "Division" : kind === "department" ? "Department" : "Location";
  const displayName = knownName || id;
  const gate = (featureId: string) =>
    isFieldFeatureModuleEnabled(activeModules, featureId, opts);

  const actions = [
    {
      id: "inspection",
      label: "Start inspection",
      href: `/inspection/new/?targetType=LOCATION&targetId=${encodeURIComponent(id)}`,
      show: gate("inspections-hub"),
    },
    {
      id: "hazard",
      label: "Report hazard",
      href: `/report/hazard/?locationId=${encodeURIComponent(id)}`,
      show: gate("report"),
    },
    {
      id: "emergency",
      label: "Emergency procedures",
      href: "/more/emergency/",
      show: gate("more-emergency"),
    },
    {
      id: "equipment",
      label: "View equipment",
      href: "/more/equipment/",
      show: gate("more-equipment"),
    },
    {
      id: "forms",
      label: "View forms",
      href: "/forms/",
      show: gate("more-forms"),
    },
    {
      id: "supplies",
      label: "Safety supplies",
      href: "/more/safety-supplies/",
      show: gate("more-safety-supplies"),
    },
    {
      id: "fleet",
      label: "Fleet",
      href: "/fleet/",
      show: gate("fleet"),
    },
    {
      id: "dot",
      label: "DOT / DVIR",
      href: "/dot/",
      show: gate("more-dot"),
    },
  ].filter((action) => action.show);

  return (
    <>
      <p className="ff-brand-mark">{title}</p>
      <h1 className="ff-page-title">{displayName}</h1>
      <p className="ff-page-body">
        Active working context is set. Choose an action for this {title.toLowerCase()}.
      </p>

      <div className="ff-action-grid">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="ff-action-tile"
            onClick={() => router.push(action.href)}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="ff-btn ff-btn-secondary ff-action-grid-span"
          onClick={() => router.push("/")}
        >
          Continue to Home
        </button>
      </div>
    </>
  );
}

export function LocationClient() {
  return (
    <Suspense fallback={<LoadingState label="Loading location…" />}>
      <LocationInner />
    </Suspense>
  );
}
