#!/usr/bin/env node
/**
 * Producers P2 Phase 3 — Storage inventory plan gate (read-only).
 *
 * Refuses unless FORGE_P2_STORAGE_INVENTORY_AUTHORIZED=true after
 * APPROVE-PRODUCERS-STORAGE-INVENTORY.md is signed.
 *
 *   node scripts/ind11b-p2-storage-inventory-plan.mjs
 */
import fs from "node:fs";
import path from "node:path";

const BUSINESS_ID = "business-1782553339499";
const PROJECT_ID = "forge-industrial-safety";
const APPROVAL = path.resolve(
  "docs/program/industrial-migration/ind-11/evidence/p2/03-storage/APPROVE-PRODUCERS-STORAGE-INVENTORY.md",
);

function fail(msg, code = 2) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

if (process.env.FORGE_P2_STORAGE_INVENTORY_AUTHORIZED?.trim() !== "true") {
  fail(
    "Refused: set FORGE_P2_STORAGE_INVENTORY_AUTHORIZED=true after signing APPROVE-PRODUCERS-STORAGE-INVENTORY.md",
  );
}

if (!fs.existsSync(APPROVAL)) {
  fail(`Approval missing: ${APPROVAL}`);
}
const approvalText = fs.readFileSync(APPROVAL, "utf8");
if (!/\*\*Status:\*\*\s*SIGNED/i.test(approvalText)) {
  fail("Approval file is not SIGNED");
}
if (!/AUTHORIZED/i.test(approvalText)) {
  fail("Approval file missing AUTHORIZED status");
}
if (!/APPROVED\s*\(electronic/i.test(approvalText)) {
  fail("Approval signatures section missing Program Owner APPROVED (electronic...) mark");
}

const plan = {
  ok: true,
  phase: "PRODUCERS-P2-storage-inventory-plan",
  mode: "read-only",
  firebaseProject: PROJECT_ID,
  firebaseBusinessId: BUSINESS_ID,
  buckets: [`${PROJECT_ID}.appspot.com`, `${PROJECT_ID}.firebasestorage.app`],
  matchRules: [
    `path contains /${BUSINESS_ID}/ or ends/starts segment`,
    "custom metadata businessId / organizationId equals pilot business",
  ],
  captures: [
    "path",
    "size",
    "contentType",
    "md5Hash",
    "crc32c",
    "generation",
    "updated",
    "category",
  ],
  writes: "NONE",
  next: "node scripts/ind11b-p2-run-storage-inventory.mjs",
  authorization: {
    gate: "FORGE_P2_STORAGE_INVENTORY_AUTHORIZED",
    approval: "evidence/p2/03-storage/APPROVE-PRODUCERS-STORAGE-INVENTORY.md",
    signed: true,
  },
};

console.log(JSON.stringify(plan, null, 2));
