import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { defaultSpaConnectSrcExtras } from "./forge-static-hosting-csp.js";
import { ForgeStaticHosting } from "./forge-static-hosting.js";

export interface ForgeFieldHostingProps {
  config: ForgeEnvironmentConfig;
}

/** Forge Field PWA static hosting (mobile industrial safety). */
export class ForgeFieldHosting extends ForgeStaticHosting {
  constructor(scope: Construct, id: string, props: ForgeFieldHostingProps) {
    const { config } = props;
    super(scope, id, {
      config,
      appKey: "field",
      displayName: "Field Web",
      domainName: config.domains?.field,
      certificateArn: config.edge.certificateArn,
      apiProxyOriginHostname: config.domains?.api,
      cspConnectSrcExtras: defaultSpaConnectSrcExtras(config),
      // QR camera scanner requires getUserMedia; notifications for Web Push prompts.
      // bluetooth=(self) keeps Direct Brady Web Bluetooth available.
      permissionsPolicy:
        "camera=(self), microphone=(), geolocation=(), notifications=(self), bluetooth=(self)",
      // Device preview panels (Cursor, etc.) embed the app in an iframe.
      allowIframeEmbedding: config.environmentName === "development",
      // Dynamic Field routes export only placeholder shells via generateStaticParams.
      // Escaping matches forge-static-hosting industrial rewrites (\\/ → \/ in CF Function).
      // shellExt is set by the shared DirectoryIndex function (index.html vs index.txt)
      // after trailingSlash soft-nav normalization (.../id.txt → .../id/index.txt).
      viewerRequestExtraRewrites: `
  var fieldScanEquip = uri.match(/^\\/scan\\/equipment\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldScanEquip && fieldScanEquip[1] !== 'placeholder') {
    request.uri = '/scan/equipment/placeholder/' + shellExt;
    return request;
  }
  var fieldScan = uri.match(/^\\/scan\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldScan && fieldScan[1] !== 'placeholder' && fieldScan[1] !== 'equipment') {
    request.uri = '/scan/placeholder/' + shellExt;
    return request;
  }
  var fieldEquip = uri.match(/^\\/equipment\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldEquip && fieldEquip[1] !== 'placeholder') {
    request.uri = '/equipment/placeholder/' + shellExt;
    return request;
  }
  var fieldInspection = uri.match(/^\\/inspection\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldInspection && fieldInspection[1] !== 'placeholder' && fieldInspection[1] !== 'new') {
    request.uri = '/inspection/placeholder/' + shellExt;
    return request;
  }
  var fieldCorrective = uri.match(/^\\/corrective\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldCorrective && fieldCorrective[1] !== 'placeholder') {
    request.uri = '/corrective/placeholder/' + shellExt;
    return request;
  }
  var fieldLoto = uri.match(/^\\/loto\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldLoto && fieldLoto[1] !== 'placeholder') {
    request.uri = '/loto/placeholder/' + shellExt;
    return request;
  }
  var fieldJsa = uri.match(/^\\/jsa\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldJsa && fieldJsa[1] !== 'placeholder') {
    request.uri = '/jsa/placeholder/' + shellExt;
    return request;
  }
  var fieldLocation = uri.match(/^\\/location\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldLocation && fieldLocation[1] !== 'placeholder') {
    request.uri = '/location/placeholder/' + shellExt;
    return request;
  }
  var fieldTaskItem = uri.match(/^\\/tasks\\/item\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldTaskItem && fieldTaskItem[1] !== 'placeholder') {
    request.uri = '/tasks/item/placeholder/' + shellExt;
    return request;
  }
  var fieldMessaging = uri.match(/^\\/messaging\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldMessaging && fieldMessaging[1] !== 'placeholder' && fieldMessaging[1] !== 'new') {
    request.uri = '/messaging/placeholder/' + shellExt;
    return request;
  }
  var fieldForms = uri.match(/^\\/forms\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldForms && fieldForms[1] !== 'placeholder') {
    request.uri = '/forms/placeholder/' + shellExt;
    return request;
  }
  var fieldDvir = uri.match(/^\\/dvir\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldDvir && fieldDvir[1] !== 'placeholder') {
    request.uri = '/dvir/placeholder/' + shellExt;
    return request;
  }
  var fieldTraining = uri.match(/^\\/training\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldTraining && fieldTraining[1] !== 'placeholder') {
    request.uri = '/training/placeholder/' + shellExt;
    return request;
  }
  var fieldSanLoc = uri.match(/^\\/scan\\/sanitation-location\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldSanLoc && fieldSanLoc[1] !== 'placeholder') {
    request.uri = '/scan/sanitation-location/placeholder/' + shellExt;
    return request;
  }
  var fieldSanPest = uri.match(/^\\/scan\\/sanitation-pest-device\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldSanPest && fieldSanPest[1] !== 'placeholder') {
    request.uri = '/scan/sanitation-pest-device/placeholder/' + shellExt;
    return request;
  }
  var fieldReport = uri.match(/^\\/report\\/([^/]+)(?:\\/index\\.(?:html|txt))?\\/?$/);
  if (fieldReport) {
    var reportType = fieldReport[1];
    if (reportType !== 'hazard' && reportType !== 'incident' && reportType !== 'observation' && reportType !== 'near-miss') {
      request.uri = '/report/hazard/' + shellExt;
      return request;
    }
  }
`,
    });
  }
}
