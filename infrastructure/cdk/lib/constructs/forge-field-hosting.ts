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
      permissionsPolicy: "camera=(self), microphone=(), geolocation=(), notifications=(self)",
      // Device preview panels (Cursor, etc.) embed the app in an iframe.
      allowIframeEmbedding: config.environmentName === "development",
      // Dynamic Field routes export only placeholder shells via generateStaticParams.
      // Escaping matches forge-static-hosting industrial rewrites (\\/ → \/ in CF Function).
      viewerRequestExtraRewrites: `
  var fieldScanEquip = uri.match(/^\\/scan\\/equipment\\/([^/]+)\\/?$/);
  if (fieldScanEquip && fieldScanEquip[1] !== 'placeholder') {
    request.uri = '/scan/equipment/placeholder/index.html';
    return request;
  }
  var fieldScan = uri.match(/^\\/scan\\/([^/]+)\\/?$/);
  if (fieldScan && fieldScan[1] !== 'placeholder' && fieldScan[1] !== 'equipment') {
    request.uri = '/scan/placeholder/index.html';
    return request;
  }
  var fieldEquip = uri.match(/^\\/equipment\\/([^/]+)\\/?$/);
  if (fieldEquip && fieldEquip[1] !== 'placeholder') {
    request.uri = '/equipment/placeholder/index.html';
    return request;
  }
  var fieldInspection = uri.match(/^\\/inspection\\/([^/]+)\\/?$/);
  if (fieldInspection && fieldInspection[1] !== 'placeholder' && fieldInspection[1] !== 'new') {
    request.uri = '/inspection/placeholder/index.html';
    return request;
  }
  var fieldCorrective = uri.match(/^\\/corrective\\/([^/]+)\\/?$/);
  if (fieldCorrective && fieldCorrective[1] !== 'placeholder') {
    request.uri = '/corrective/placeholder/index.html';
    return request;
  }
  var fieldLoto = uri.match(/^\\/loto\\/([^/]+)\\/?$/);
  if (fieldLoto && fieldLoto[1] !== 'placeholder') {
    request.uri = '/loto/placeholder/index.html';
    return request;
  }
  var fieldJsa = uri.match(/^\\/jsa\\/([^/]+)\\/?$/);
  if (fieldJsa && fieldJsa[1] !== 'placeholder') {
    request.uri = '/jsa/placeholder/index.html';
    return request;
  }
  var fieldLocation = uri.match(/^\\/location\\/([^/]+)\\/?$/);
  if (fieldLocation && fieldLocation[1] !== 'placeholder') {
    request.uri = '/location/placeholder/index.html';
    return request;
  }
  var fieldTaskItem = uri.match(/^\\/tasks\\/item\\/([^/]+)\\/?$/);
  if (fieldTaskItem && fieldTaskItem[1] !== 'placeholder') {
    request.uri = '/tasks/item/placeholder/index.html';
    return request;
  }
  var fieldMessaging = uri.match(/^\\/messaging\\/([^/]+)\\/?$/);
  if (fieldMessaging && fieldMessaging[1] !== 'placeholder' && fieldMessaging[1] !== 'new') {
    request.uri = '/messaging/placeholder/index.html';
    return request;
  }
  var fieldForms = uri.match(/^\\/forms\\/([^/]+)\\/?$/);
  if (fieldForms && fieldForms[1] !== 'placeholder') {
    request.uri = '/forms/placeholder/index.html';
    return request;
  }
  var fieldDvir = uri.match(/^\\/dvir\\/([^/]+)\\/?$/);
  if (fieldDvir && fieldDvir[1] !== 'placeholder') {
    request.uri = '/dvir/placeholder/index.html';
    return request;
  }
  var fieldTraining = uri.match(/^\\/training\\/([^/]+)\\/?$/);
  if (fieldTraining && fieldTraining[1] !== 'placeholder') {
    request.uri = '/training/placeholder/index.html';
    return request;
  }
  var fieldSanLoc = uri.match(/^\\/scan\\/sanitation-location\\/([^/]+)\\/?$/);
  if (fieldSanLoc && fieldSanLoc[1] !== 'placeholder') {
    request.uri = '/scan/sanitation-location/placeholder/index.html';
    return request;
  }
  var fieldSanPest = uri.match(/^\\/scan\\/sanitation-pest-device\\/([^/]+)\\/?$/);
  if (fieldSanPest && fieldSanPest[1] !== 'placeholder') {
    request.uri = '/scan/sanitation-pest-device/placeholder/index.html';
    return request;
  }
  var fieldReport = uri.match(/^\\/report\\/([^/]+)\\/?$/);
  if (fieldReport) {
    var reportType = fieldReport[1];
    if (reportType !== 'hazard' && reportType !== 'incident' && reportType !== 'observation' && reportType !== 'near-miss') {
      request.uri = '/report/hazard/index.html';
      return request;
    }
  }
`,
    });
  }
}
