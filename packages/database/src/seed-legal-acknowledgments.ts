import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createId } from "./ids.js";
import * as schema from "./schema.js";
import {
  attestationTemplateVersions,
  attestationTemplates,
  legalAcknowledgmentRequirements,
  legalDocumentVersions,
  legalDocuments,
} from "./schema.js";

type SeedDb = PostgresJsDatabase<typeof schema>;

export function hashLegalContent(content: string): string {
  return createHash("sha256").update(content.trim(), "utf8").digest("hex");
}

const DRAFT_BANNER =
  "<p><strong>DRAFT — Not final legal language.</strong> Placeholder for development acknowledgment testing.</p>";

const SEED_DOCS = [
  {
    documentKey: "forge-industrial-user-access",
    documentType: "USER_ACCESS_ACKNOWLEDGMENT",
    title: "Forge Industrial Safety User Access Acknowledgment",
    version: "USER-ACK-1.0",
    content: `${DRAFT_BANNER}
<p>By accessing Forge Industrial Safety, I acknowledge that this account is assigned to me and is intended only for authorized business use. I agree to protect my login credentials and not permit another individual to use my account.</p>
<p>I understand that activity performed through my account may be electronically recorded and retained, including logins, record creation or modification, approvals, acknowledgments, electronic signatures, and administrative actions.</p>
<p>I understand that Forge Industrial Safety is a software management and documentation platform and does not replace my employer's safety policies, required training, inspections, competent or qualified persons, professional judgment, or compliance responsibilities.</p>`,
  },
  {
    documentKey: "forge-global-terms",
    documentType: "TERMS_OF_USE",
    title: "Terms of Use",
    version: "TOU-1.0",
    content: `${DRAFT_BANNER}<p>Placeholder Terms of Use for Forge platform users.</p>`,
  },
  {
    documentKey: "forge-global-privacy",
    documentType: "PRIVACY_NOTICE",
    title: "Privacy Notice",
    version: "PRIV-1.0",
    content: `${DRAFT_BANNER}<p>Placeholder Privacy Notice describing how Forge processes account and usage data.</p>`,
  },
  {
    documentKey: "forge-global-acceptable-use",
    documentType: "ACCEPTABLE_USE_POLICY",
    title: "Acceptable Use Policy",
    version: "AUP-1.0",
    content: `${DRAFT_BANNER}<p>Placeholder Acceptable Use Policy for Forge platform access.</p>`,
  },
  {
    documentKey: "forge-accessibility",
    documentType: "ACCESSIBILITY_NOTICE",
    title: "Accessibility Notice",
    version: "A11Y-1.0",
    content: `${DRAFT_BANNER}<p>Forge strives to make Industrial Safety accessible. This notice is not an ADA, Section 508, or WCAG certification claim.</p>`,
  },
] as const;

const TRAINING_ATTESTATION_TEXT =
  "I certify that the information associated with this training completion is accurate and complete to the best of my knowledge and that I am performing this action using my individually assigned Forge account.";

/**
 * Idempotent seed of global Industrial legal documents + ACTIVE requirements
 * and the TRAINING_COMPLETION attestation template. Safe for development.
 */
export async function seedLegalAcknowledgments(db: SeedDb): Promise<void> {
  const now = new Date();

  for (const doc of SEED_DOCS) {
    const existing = await db
      .select({ id: legalDocuments.id, currentVersionId: legalDocuments.currentVersionId })
      .from(legalDocuments)
      .where(and(eq(legalDocuments.documentKey, doc.documentKey), isNull(legalDocuments.tenantId)))
      .limit(1);

    let documentId = existing[0]?.id;
    if (!documentId) {
      documentId = createId();
      await db.insert(legalDocuments).values({
        id: documentId,
        tenantId: null,
        documentKey: doc.documentKey,
        productScope: "FORGE_INDUSTRIAL",
        documentType: doc.documentType,
        title: doc.title,
        description: "Development seed document (DRAFT language).",
        status: "ACTIVE",
        currentVersionId: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const versions = await db
      .select({ id: legalDocumentVersions.id })
      .from(legalDocumentVersions)
      .where(
        and(
          eq(legalDocumentVersions.legalDocumentId, documentId),
          eq(legalDocumentVersions.versionNumber, 1),
        ),
      )
      .limit(1);

    let versionId = versions[0]?.id;
    if (!versionId) {
      versionId = createId();
      const hash = hashLegalContent(doc.content);
      await db.insert(legalDocumentVersions).values({
        id: versionId,
        legalDocumentId: documentId,
        tenantId: null,
        version: doc.version,
        versionNumber: 1,
        effectiveAt: now,
        publishedAt: now,
        contentFormat: "HTML",
        content: doc.content,
        contentHash: hash,
        changeSummary: "Initial development seed version",
        materialChange: true,
        requiresReacknowledgment: true,
        status: "ACTIVE",
        createdAt: now,
      });
      await db
        .update(legalDocuments)
        .set({ currentVersionId: versionId, status: "ACTIVE", updatedAt: now })
        .where(eq(legalDocuments.id, documentId));
    }

    const reqExisting = await db
      .select({ id: legalAcknowledgmentRequirements.id })
      .from(legalAcknowledgmentRequirements)
      .where(
        and(
          isNull(legalAcknowledgmentRequirements.tenantId),
          eq(legalAcknowledgmentRequirements.documentVersionId, versionId),
        ),
      )
      .limit(1);
    if (reqExisting.length === 0) {
      await db.insert(legalAcknowledgmentRequirements).values({
        id: createId(),
        tenantId: null,
        product: "FORGE_INDUSTRIAL",
        documentId,
        documentVersionId: versionId,
        required: true,
        requiredFrom: now,
        reacknowledgmentPolicy: "ON_MATERIAL_VERSION",
        blockingMode: "BLOCKING",
        createdAt: now,
      });
    }
  }

  const templateKey = "TRAINING_COMPLETION";
  const tmplExisting = await db
    .select({ id: attestationTemplates.id })
    .from(attestationTemplates)
    .where(and(eq(attestationTemplates.templateKey, templateKey), isNull(attestationTemplates.tenantId)))
    .limit(1);
  let templateId = tmplExisting[0]?.id;
  if (!templateId) {
    templateId = createId();
    await db.insert(attestationTemplates).values({
      id: templateId,
      tenantId: null,
      templateKey,
      product: "FORGE_INDUSTRIAL",
      module: "training",
      title: "Training completion certification",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
  }
  const tv = await db
    .select({ id: attestationTemplateVersions.id })
    .from(attestationTemplateVersions)
    .where(
      and(
        eq(attestationTemplateVersions.templateId, templateId),
        eq(attestationTemplateVersions.versionNumber, 1),
      ),
    )
    .limit(1);
  if (tv.length === 0) {
    const versionId = createId();
    const hash = hashLegalContent(TRAINING_ATTESTATION_TEXT);
    await db.insert(attestationTemplateVersions).values({
      id: versionId,
      templateId,
      tenantId: null,
      version: "1.0",
      versionNumber: 1,
      attestationText: TRAINING_ATTESTATION_TEXT,
      contentHash: hash,
      status: "ACTIVE",
      publishedAt: now,
      createdAt: now,
    });
    await db
      .update(attestationTemplates)
      .set({ currentVersionId: versionId, updatedAt: now })
      .where(eq(attestationTemplates.id, templateId));
  }
}
