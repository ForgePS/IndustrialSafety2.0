/**
 * DM-S0 Firestore inventory — READ ONLY.
 * Forbidden: set, update, delete, create, add, writeBatch, commit.
 */
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  classifyDrift,
  detectTenantKeys,
  mergeFieldProfiles,
  type FieldProfile,
} from "./profile.js";

export type CollectionInventory = {
  collection: string;
  count: number | "UNKNOWN";
  countError?: string;
  tenantKeysObserved: string[];
  tenantScoped: boolean;
  sampleSize: number;
  subcollections: string[];
  schema: FieldProfile[];
  drift: string;
  dateFields: string[];
  referenceFields: string[];
  fileFields: string[];
  softDeleteFields: string[];
  statusValues: string[];
  deltaClass: "DELTA_SAFE" | "DELTA_UNSAFE" | "PARTIAL";
  deltaNotes: string;
};

export type SubcollectionInventory = {
  parentCollection: string;
  parentDocIdRedacted: string;
  subcollection: string;
  pathPattern: string;
  estimatedCount: number | "UNKNOWN";
  tenantScope: string;
};

const SAMPLE_SIZE = 25;
const SUBCOLLECTION_PROBE_DOCS = 5;

async function countCollection(
  db: Firestore,
  collectionPath: string,
): Promise<{ count: number | "UNKNOWN"; error?: string }> {
  try {
    const agg = await db.collection(collectionPath).count().get();
    return { count: agg.data().count };
  } catch (e) {
    return {
      count: "UNKNOWN",
      error: e instanceof Error ? e.message.slice(0, 200) : "count_failed",
    };
  }
}

function pickDateFields(profiles: FieldProfile[]): string[] {
  return profiles
    .filter(
      (p) =>
        p.observedTypes.includes("timestamp") ||
        /At$|Date$|time|updated|created|modified/i.test(p.fieldName),
    )
    .map((p) => p.fieldName);
}

function pickRefFields(profiles: FieldProfile[]): string[] {
  return profiles
    .filter((p) => p.observedTypes.includes("reference") || /(Id|Ref|ids)$/i.test(p.fieldName))
    .map((p) => p.fieldName);
}

function pickFileFields(profiles: FieldProfile[]): string[] {
  return profiles
    .filter((p) => /url|path|attachment|file|photo|document|storage/i.test(p.fieldName))
    .map((p) => p.fieldName);
}

function pickSoftDelete(profiles: FieldProfile[]): string[] {
  return profiles
    .filter((p) => /deleted|archived|inactive|removed|status/i.test(p.fieldName))
    .map((p) => p.fieldName);
}

function classifyDelta(dateFields: string[]): {
  deltaClass: CollectionInventory["deltaClass"];
  deltaNotes: string;
} {
  const hasUpdated = dateFields.some((f) => /updated|modified|lastUpdated/i.test(f));
  const hasCreated = dateFields.some((f) => /created/i.test(f));
  if (hasUpdated) return { deltaClass: "DELTA_SAFE", deltaNotes: "updatedAt-like field present" };
  if (hasCreated)
    return { deltaClass: "PARTIAL", deltaNotes: "createdAt only; no reliable updatedAt" };
  return { deltaClass: "DELTA_UNSAFE", deltaNotes: "no reliable modification timestamp" };
}

export async function inventoryRootCollections(db: Firestore): Promise<{
  collections: CollectionInventory[];
  subcollections: SubcollectionInventory[];
}> {
  const roots = await db.listCollections();
  const collections: CollectionInventory[] = [];
  const subcollections: SubcollectionInventory[] = [];

  for (const col of roots) {
    const name = col.id;
    const { count, error } = await countCollection(db, name);

    const snap = await db.collection(name).limit(SAMPLE_SIZE).get();
    const docs = snap.docs.map((d) => d.data() as Record<string, unknown>);
    const profiles = mergeFieldProfiles(docs);
    const tenantKeys = detectTenantKeys(profiles.map((p) => p.fieldName.split(".")[0]!));
    const dateFields = pickDateFields(profiles);
    const { deltaClass, deltaNotes } = classifyDelta(dateFields);

    const statusValues = new Set<string>();
    for (const doc of docs) {
      const status = doc.status ?? doc.state ?? doc.lifecycleStatus;
      if (typeof status === "string" && status.length < 64) statusValues.add(status);
    }

    const subNames = new Set<string>();
    const probeDocs = snap.docs.slice(0, SUBCOLLECTION_PROBE_DOCS);
    for (const doc of probeDocs) {
      const subs = await doc.ref.listCollections();
      for (const s of subs) {
        subNames.add(s.id);
        const subCount = await countCollection(db, `${name}/${doc.id}/${s.id}`);
        subcollections.push({
          parentCollection: name,
          parentDocIdRedacted: `[id:${doc.id.slice(0, 8)}…]`,
          subcollection: s.id,
          pathPattern: `${name}/{docId}/${s.id}`,
          estimatedCount: subCount.count,
          tenantScope: tenantKeys.length ? tenantKeys.join(",") : "UNKNOWN",
        });
      }
    }

    collections.push({
      collection: name,
      count,
      countError: error,
      tenantKeysObserved: tenantKeys,
      tenantScoped: tenantKeys.length > 0,
      sampleSize: docs.length,
      subcollections: [...subNames].sort(),
      schema: profiles,
      drift: classifyDrift(profiles, docs.length),
      dateFields,
      referenceFields: pickRefFields(profiles),
      fileFields: pickFileFields(profiles),
      softDeleteFields: pickSoftDelete(profiles),
      statusValues: [...statusValues].sort(),
      deltaClass,
      deltaNotes,
    });
  }

  collections.sort((a, b) => a.collection.localeCompare(b.collection));
  return { collections, subcollections };
}

export async function discoverBusinessIds(
  db: Firestore,
  collections: CollectionInventory[],
): Promise<
  Array<{ sourceTenantId: string; collectionsPresent: string[]; sampleFacilityHints: number }>
> {
  const byBusiness = new Map<string, Set<string>>();

  for (const col of collections) {
    if (!col.tenantScoped) continue;
    const key = col.tenantKeysObserved[0];
    if (!key) continue;
    // Distinct business IDs via bounded scan (pagination, not full dump of PII fields)
    let last: QueryDocumentSnapshot | undefined;
    let scanned = 0;
    const maxScan = 500;
    while (scanned < maxScan) {
      let q = db.collection(col.collection).select(key).limit(100);
      if (last) q = q.startAfter(last);
      const page = await q.get();
      if (page.empty) break;
      for (const doc of page.docs) {
        const v = doc.get(key);
        if (typeof v === "string" && v.length > 0 && v.length < 128) {
          const set = byBusiness.get(v) ?? new Set<string>();
          set.add(col.collection);
          byBusiness.set(v, set);
        }
      }
      scanned += page.size;
      last = page.docs[page.docs.length - 1];
      if (page.size < 100) break;
    }
  }

  return [...byBusiness.entries()]
    .map(([sourceTenantId, cols]) => ({
      sourceTenantId,
      collectionsPresent: [...cols].sort(),
      sampleFacilityHints: 0,
    }))
    .sort((a, b) => a.sourceTenantId.localeCompare(b.sourceTenantId));
}
