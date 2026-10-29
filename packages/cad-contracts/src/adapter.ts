import type {
  CadAckOutcome,
  CadAuthenticationStatus,
  CadNormalizedEventType,
  CadTransportType,
} from "./enums.js";

export type CadAdapterManifest = {
  adapterKey: string;
  adapterVersion: string;
  vendorName: string;
  productName: string;
  supportedSourceVersions: string[];
  supportedTransports: CadTransportType[];
  supportedEventTypes: CadNormalizedEventType[];
  authenticationTypes: string[];
  acknowledgementBehavior: string;
  orderingGuarantee: "NONE" | "BEST_EFFORT" | "PER_INCIDENT_SEQUENCE";
  sourceIdStrategy: string;
  configurationSchemaVersion: string;
  mappingTemplateVersion: string;
  documentationReference?: string;
  deprecatedAt?: string | null;
  replacementAdapterKey?: string | null;
};

export type CadConfigurationValidationResult = {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
};

export type CadConnectionContext = {
  tenantId: string;
  connectionId: string;
  publicId: string;
  adapterKey: string;
  adapterVersion: string;
  environment: string;
  transportType: CadTransportType;
  configuration: Record<string, unknown>;
  /** Secrets Manager ARNs only — never secret values. */
  credentialsSecretArn?: string | null;
  webhookSecretArn?: string | null;
  webhookKeyId?: string | null;
};

export type CadInboundRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: Uint8Array | string;
  receivedAt: string;
  correlationId: string;
  remoteAddress?: string;
};

export type CadAuthenticationResult = {
  status: CadAuthenticationStatus;
  keyId?: string;
  reasonCode?: string;
  reasonSummary?: string;
};

export type CadRawMessage = {
  id: string;
  tenantId: string;
  connectionId: string;
  receivedAt: string;
  transportType: CadTransportType;
  sourceMessageId?: string;
  sourceIncidentId?: string;
  sourceEventType?: string;
  sourceVersion?: string;
  sourceSequence?: number;
  contentType?: string;
  contentEncoding?: string;
  payloadStorageType: "S3" | "INLINE_ENCRYPTED";
  payloadS3Bucket?: string;
  payloadS3Key?: string;
  payloadHash: string;
  payloadSizeBytes?: number;
};

export type CadParsedPayload = {
  rawMessageId: string;
  sourceVersion?: string;
  sourceMessageId?: string;
  sourceIncidentId?: string;
  sourceEventId?: string;
  sourceEventType?: string;
  sourceSequence?: number;
  /** Vendor-shaped parsed object — never persisted as Forge incident fields directly. */
  vendorPayload: unknown;
};

export type CadSourceProvenance = {
  fieldIdentifier: string;
  sourcePath: string;
  sourceValueHash?: string;
  confidence?: number;
};

export type CadNormalizedUnit = {
  sourceUnitId: string;
  sourceUnitCallsign?: string;
  status?: string;
  dispatchedAt?: string;
  enRouteAt?: string;
  arrivedAt?: string;
  clearedAt?: string;
  forgeApparatusId?: string;
  mappingConfidence?: number;
};

export type CadNormalizedPersonnel = {
  sourcePersonnelId: string;
  sourceName?: string;
  role?: string;
  forgePersonId?: string;
  mappingConfidence?: number;
  externalAgency?: boolean;
};

export type CadNormalizedComment = {
  sourceCommentId?: string;
  sourceSequence?: number;
  sourceTimestamp?: string;
  normalizedTimestamp?: string;
  category?: string;
  author?: string;
  text: string;
  restricted?: boolean;
};

export type CadNormalizedEvent = {
  eventId: string;
  tenantId: string;
  connectionId: string;
  rawMessageId: string;
  source: {
    vendor: string;
    adapterKey: string;
    adapterVersion: string;
    messageId?: string;
    eventId?: string;
    incidentId?: string;
    incidentNumber?: string;
    sourceVersion?: string;
    sequence?: number;
    timestamp: string;
  };
  eventType: CadNormalizedEventType;
  incident: {
    callType?: string;
    callSubtype?: string;
    nature?: string;
    priority?: string;
    status?: string;
    alarmLevel?: string;
    responsePlan?: string;
    dispatchGroup?: string;
    mutualAid?: boolean;
    cancelled?: boolean;
  };
  location?: {
    fullAddress?: string;
    addressNumber?: string;
    street?: string;
    unit?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    county?: string;
    latitude?: number;
    longitude?: number;
    crossStreets?: string[];
    commonName?: string;
    locationName?: string;
    apartment?: string;
    mapGrid?: string;
    district?: string;
    responseZone?: string;
    stationArea?: string;
  };
  timestamps?: {
    callReceived?: string;
    callEntered?: string;
    dispatch?: string;
    controlled?: string;
    closed?: string;
  };
  reportingParty?: {
    name?: string;
    callbackNumber?: string;
    partyType?: string;
    location?: string;
    restricted?: boolean;
  };
  units?: CadNormalizedUnit[];
  personnel?: CadNormalizedPersonnel[];
  comments?: CadNormalizedComment[];
  disposition?: {
    code?: string;
    description?: string;
    cancelled?: boolean;
    noResponse?: boolean;
    falseAlarm?: boolean;
    duplicateCall?: boolean;
    mutualAid?: boolean;
    transferred?: boolean;
    closedReason?: string;
  };
  provenance: CadSourceProvenance[];
};

export type CadNormalizationResult = {
  ok: boolean;
  event?: CadNormalizedEvent;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
};

export type CadProcessingResult = {
  outcome: CadAckOutcome;
  rawMessageId?: string;
  normalizedEventId?: string;
  incidentId?: string;
  correlationId: string;
  summary?: string;
};

export type CadAcknowledgement = {
  outcome: CadAckOutcome;
  httpStatus: number;
  body: Record<string, unknown>;
};

export type CadHealthResult = {
  healthy: boolean;
  status: "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  checkedAt: string;
  latencyMs?: number;
  detail?: string;
};

export type CadReplayRequest = {
  tenantId: string;
  connectionId: string;
  rawMessageIds?: string[];
  fromReceivedAt?: string;
  toReceivedAt?: string;
  reason: string;
};

export type CadReplayResult = {
  accepted: boolean;
  replayedCount: number;
  skippedCount: number;
  correlationId: string;
};

export type CadPollCursor = {
  cursor?: string | null;
  watermark?: string | null;
};

export type CadPolledMessage = {
  sourceMessageId: string;
  payload: Record<string, unknown>;
  receivedAt?: string;
  contentType?: string;
};

export type CadPollResult = {
  messages: CadPolledMessage[];
  nextCursor?: string | null;
  nextWatermark?: string | null;
  healthy: boolean;
  detail?: string;
};

export type CadNormalizationContext = {
  tenantId: string;
  connectionId: string;
  mappingProfileId?: string | null;
  mappingProfileVersion?: number | null;
  timezone?: string;
};

/**
 * Vendor-neutral adapter contract.
 * Adapters normalize input only — they must never write Forge incidents.
 */
export interface CadAdapter {
  readonly manifest: CadAdapterManifest;
  validateConfiguration(configuration: unknown): CadConfigurationValidationResult;
  authenticateMessage(
    request: CadInboundRequest,
    context: CadConnectionContext,
  ): Promise<CadAuthenticationResult>;
  parseRawMessage(message: CadRawMessage, payloadBytes: Uint8Array): Promise<CadParsedPayload>;
  normalize(
    parsed: CadParsedPayload,
    context: CadNormalizationContext,
  ): Promise<CadNormalizationResult>;
  buildAcknowledgement(result: CadProcessingResult): CadAcknowledgement;
  testConnection(context: CadConnectionContext): Promise<CadHealthResult>;
  /** Optional: implemented by adapters that support POLLING / SYNTHETIC_SIMULATOR. */
  pollMessages?(context: CadConnectionContext, cursor: CadPollCursor): Promise<CadPollResult>;
}
