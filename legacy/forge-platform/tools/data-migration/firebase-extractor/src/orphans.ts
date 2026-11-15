/**
 * Read-only orphan / relationship scan for DM-S1.
 * Does not repair source data.
 */
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

export type OrphanReport = {
  generatedAt: string;
  checks: Array<{
    relationship: string;
    sourceCollection: string;
    sourceField: string;
    targetCollection: string;
    sampledSources: number;
    missingTargets: number;
    orphanReferenceCount: number;
    notes: string;
  }>;
  totals: { relationshipsChecked: number; orphanReferenceCount: number };
};

async function loadIdSet(db: Firestore, collection: string, max = 20000): Promise<Set<string>> {
  const ids = new Set<string>();
  let last: QueryDocumentSnapshot | undefined;
  while (ids.size < max) {
    let q = db.collection(collection).select().limit(500);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const d of page.docs) ids.add(d.id);
    last = page.docs[page.docs.length - 1];
    if (page.size < 500) break;
  }
  return ids;
}

async function loadNameSet(
  db: Firestore,
  collection: string,
  nameField: string,
  max = 20000,
): Promise<Set<string>> {
  const names = new Set<string>();
  let last: QueryDocumentSnapshot | undefined;
  while (names.size < max) {
    let q = db.collection(collection).select(nameField).limit(500);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const d of page.docs) {
      const n = d.get(nameField);
      if (typeof n === "string" && n.trim()) names.add(n.trim().toLowerCase());
    }
    last = page.docs[page.docs.length - 1];
    if (page.size < 500) break;
  }
  return names;
}

async function sampleFieldValues(
  db: Firestore,
  collection: string,
  field: string,
  max = 2000,
): Promise<string[]> {
  const values: string[] = [];
  let last: QueryDocumentSnapshot | undefined;
  while (values.length < max) {
    let q = db.collection(collection).select(field).limit(250);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    for (const d of page.docs) {
      const v = d.get(field);
      if (typeof v === "string" && v.trim()) values.push(v.trim());
      // Some records store site as { id: "..." } map
      if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") {
        const id = ((v as { id: string }).id || "").trim();
        if (id) values.push(id);
      }
    }
    last = page.docs[page.docs.length - 1];
    if (page.size < 250) break;
  }
  return values;
}

export async function buildOrphanReport(db: Firestore): Promise<OrphanReport> {
  const siteIds = await loadIdSet(db, "sites");
  const siteNames = await loadNameSet(db, "sites", "name");
  const personnelIds = await loadIdSet(db, "personnelRecords");
  const orgIds = await loadIdSet(db, "organizations");
  const assetIds = await loadIdSet(db, "assetRecords");
  const businessIds = new Set([...orgIds, "business-1782553339499", "business-forge-default"]);

  const checks: OrphanReport["checks"] = [];

  const run = async (
    relationship: string,
    sourceCollection: string,
    sourceField: string,
    targetCollection: string,
    targetIds: Set<string>,
    notes: string,
    normalize?: (v: string) => string,
  ) => {
    const values = await sampleFieldValues(db, sourceCollection, sourceField);
    let missing = 0;
    for (const v of values) {
      const key = normalize ? normalize(v) : v;
      if (!targetIds.has(key)) missing += 1;
    }
    checks.push({
      relationship,
      sourceCollection,
      sourceField,
      targetCollection,
      sampledSources: values.length,
      missingTargets: missing,
      orphanReferenceCount: missing,
      notes,
    });
  };

  // Live schema: `site` is often a DISPLAY NAME, not sites/{id}
  await run(
    "asset.site→sites.name",
    "assetRecords",
    "site",
    "sites",
    siteNames,
    "Soft facility link by display name (not document id). Mismatches = AMBIGUOUS_FACILITY_NAME",
    (v) => v.toLowerCase(),
  );
  await run(
    "asset.locationId→sites.id",
    "assetRecords",
    "locationId",
    "sites",
    siteIds,
    "Hard facility id when present",
  );
  await run(
    "personnel.site→sites.name",
    "personnelRecords",
    "site",
    "sites",
    siteNames,
    "Soft facility link by display name",
    (v) => v.toLowerCase(),
  );
  await run(
    "personnel.locationId→sites.id",
    "personnelRecords",
    "locationId",
    "sites",
    siteIds,
    "Hard facility id when present",
  );
  await run(
    "incident.site→sites.name",
    "incidents",
    "site",
    "sites",
    siteNames,
    "Soft facility link by display name",
    (v) => v.toLowerCase(),
  );
  await run(
    "loto.equipmentExternal→assetRecords",
    "lotoProcedures",
    "equipmentExternalId",
    "assetRecords",
    assetIds,
    "May be external tag not Firestore id — orphans expected",
  );
  await run(
    "loto.businessId→organizations",
    "lotoProcedures",
    "businessId",
    "organizations",
    businessIds,
    "Tenant key integrity",
  );
  await run(
    "training.userId→personnelRecords",
    "training_enrollments",
    "userId",
    "personnelRecords",
    personnelIds,
    "Enrollment userId may be Auth UID or personnel id",
  );
  await run(
    "inspection.site→sites.name",
    "inspectionRecords",
    "site",
    "sites",
    siteNames,
    "Soft facility link by display name",
    (v) => v.toLowerCase(),
  );

  const orgUserIds = await loadIdSet(db, "organization_users");
  const platformUserIds = await loadIdSet(db, "platformUsers");
  checks.push({
    relationship: "auth_users vs organization_users|platformUsers",
    sourceCollection: "FIREBASE_AUTH",
    sourceField: "uid",
    targetCollection: "organization_users+platformUsers",
    sampledSources: 0,
    missingTargets: 0,
    orphanReferenceCount: 0,
    notes: `org_users=${orgUserIds.size} platformUsers=${platformUserIds.size}; Auth count compared in identity report`,
  });

  const orphanReferenceCount = checks.reduce((s, c) => s + c.orphanReferenceCount, 0);
  return {
    generatedAt: new Date().toISOString(),
    checks,
    totals: { relationshipsChecked: checks.length, orphanReferenceCount },
  };
}
