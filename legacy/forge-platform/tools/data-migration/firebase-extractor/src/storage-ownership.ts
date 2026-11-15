/** Storage ownership classification — no GCS SDK dependency. */

export function inferOwnership(objectPath: string): {
  disposition: string;
  tenantMapping: string | null;
  relatedEntity: string | null;
} {
  const parts = objectPath.split("/");
  const top = parts[0] || "";
  if (top === "platform-billing-email-templates" || top === "platform-invoice-templates") {
    return { disposition: "PLATFORM_GLOBAL", tenantMapping: null, relatedEntity: "platform" };
  }
  if (top === "tenants" && parts[1]) {
    return {
      disposition: parts[1].startsWith("business-") ? "OWNERSHIP_CONFIRMED" : "AMBIGUOUS",
      tenantMapping: parts[1],
      relatedEntity: parts[3] || parts[2] || null,
    };
  }
  if (top === "module-attachments" && parts[1]) {
    return {
      disposition: parts[1].startsWith("business-") ? "OWNERSHIP_CONFIRMED" : "AMBIGUOUS",
      tenantMapping: parts[1],
      relatedEntity: parts[2] || null,
    };
  }
  if (
    (top === "dot-compliance" ||
      top === "certificates" ||
      top === "equipment-migrations" ||
      top === "training-imports" ||
      top === "dqf-exports") &&
    parts[1]
  ) {
    if (top === "dqf-exports" && parts[1] === "test") {
      return {
        disposition: "ORPHAN",
        tenantMapping: null,
        relatedEntity: "dqf-exports-test-artifact",
      };
    }
    return {
      disposition: parts[1].startsWith("business-") ? "OWNERSHIP_CONFIRMED" : "AMBIGUOUS",
      tenantMapping: parts[1],
      relatedEntity: top,
    };
  }
  if (!top) return { disposition: "ORPHAN", tenantMapping: null, relatedEntity: null };
  return { disposition: "AMBIGUOUS", tenantMapping: null, relatedEntity: top };
}
