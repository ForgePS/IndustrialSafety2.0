/**
 * Creator print health enablement is true when product + PRINT_MANAGER are ACTIVE
 * and printing master flags are not explicitly false.
 */
export function computeCreatorPrintingEnabled(input: {
  productStatus: string;
  printManagerModuleStatus: string;
  forgePrintingEnabled: unknown;
  printManagerFlagEnabled: unknown;
}): boolean {
  return (
    input.productStatus === "ACTIVE" &&
    input.printManagerModuleStatus === "ACTIVE" &&
    input.forgePrintingEnabled !== false &&
    input.printManagerFlagEnabled !== false
  );
}
