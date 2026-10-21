export type {
  MobileBluetoothState,
  MobilePermissionResult,
  MobilePrinterDiscoveryState,
  MobilePrinterDevice,
  MobilePrinterStatus,
  MobilePrinterCapabilities,
  MobilePrintOptions,
  MobilePrintResult,
  ScanOptions,
} from "./types";

export type { ForgeNativePrintBridge, MobilePrinterAdapter } from "./native-bridge";

export {
  MOBILE_PRINT_PERMISSIONS,
  mobilePrintPermissionCodes,
  type MobilePrintCapability,
} from "./permissions";

export {
  bradyWebBluetoothAdapter,
  createBradyWebBluetoothBridge,
  getMobilePrintBridge,
  setMobilePrintBridge,
} from "./brady-web-bluetooth-adapter";

export {
  bluefyAppStoreUrl,
  detectTabletBluetoothHint,
  isAndroidTablet,
  isIosLikeDevice,
  type TabletBluetoothHint,
} from "./tablet-bluetooth";
