/**
 * Map Mobile Print Manager capability checks onto existing Forge RBAC.
 * Spec `print.mobile.*` codes are aliases — industrial.printer.* remains canonical.
 */
export const MOBILE_PRINT_PERMISSIONS = {
  view: ["industrial.printer.view", "industrial.printer.print", "industrial.admin"],
  discover: [
    "industrial.printer.pair_bluetooth",
    "industrial.printer.view",
    "industrial.printer.manage",
    "industrial.admin",
  ],
  connect: [
    "industrial.printer.pair_bluetooth",
    "industrial.printer.print",
    "industrial.printer.manage",
    "industrial.admin",
  ],
  submit: ["industrial.printer.print", "industrial.printer.quick_print", "industrial.admin"],
  quickPrint: ["industrial.printer.print", "industrial.printer.quick_print", "industrial.admin"],
  reprint: ["industrial.printer.reprint", "industrial.printer.print", "industrial.admin"],
  managePrinters: [
    "industrial.printer.pair_bluetooth",
    "industrial.printer.manage",
    "industrial.admin",
  ],
  diagnostics: [
    "industrial.printer.run_diagnostics",
    "industrial.printer.manage",
    "industrial.admin",
  ],
} as const;

export type MobilePrintCapability = keyof typeof MOBILE_PRINT_PERMISSIONS;

export function mobilePrintPermissionCodes(capability: MobilePrintCapability): readonly string[] {
  return MOBILE_PRINT_PERMISSIONS[capability];
}
