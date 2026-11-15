import { modulesForProduct } from "@forge/contracts";
import { ForgeError } from "@forge/errors";

export type ModuleProductSelection = {
  moduleCode: string;
  /** Product that owns the module, or undefined to let entitlements resolve by code alone. */
  productCode: string | undefined;
};

/**
 * Work out which selected product each onboarding module belongs to.
 *
 * Module codes such as CORE, PERSONNEL and TRAINING exist on several products, and the
 * entitlement lookup refuses an ambiguous code. Resolution order:
 * 1. A qualified code "PRODUCT_CODE:MODULE_CODE" names its product explicitly.
 * 2. Otherwise, the one selected product whose catalog lists the module.
 * 3. If no selected product lists it, fall back to lookup by code alone (legacy modules).
 * Two or more selected products listing the same code is rejected as ambiguous.
 */
export function resolveModuleProducts(
  moduleCodes: readonly string[],
  selectedProductCodes: readonly string[],
  catalogModuleCodes: (productCode: string) => readonly string[] = (productCode) =>
    modulesForProduct(productCode).map((entry) => entry.code),
): ModuleProductSelection[] {
  const catalog = new Map(
    selectedProductCodes.map((productCode) => [
      productCode,
      new Set(catalogModuleCodes(productCode)),
    ]),
  );
  return moduleCodes.map((raw) => {
    const separator = raw.indexOf(":");
    if (separator > 0) {
      const productCode = raw.slice(0, separator).trim();
      const moduleCode = raw.slice(separator + 1).trim();
      if (!productCode || !moduleCode) {
        throw new ForgeError("VALIDATION_FAILED", `Invalid module code ${raw}`);
      }
      return { moduleCode, productCode };
    }
    const owners = selectedProductCodes.filter((productCode) => catalog.get(productCode)?.has(raw));
    if (owners.length > 1) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `Module ${raw} is offered by more than one selected product (${owners.join(", ")}). ` +
          `Send it as ${owners[0]}:${raw}.`,
      );
    }
    return { moduleCode: raw, productCode: owners[0] };
  });
}
