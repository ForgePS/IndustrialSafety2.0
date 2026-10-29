import type {
  CadAdapter,
  CadAdapterManifest,
  CadAcknowledgement,
  CadAuthenticationResult,
  CadConfigurationValidationResult,
  CadConnectionContext,
  CadHealthResult,
  CadInboundRequest,
  CadNormalizationContext,
  CadNormalizationResult,
  CadParsedPayload,
  CadProcessingResult,
  CadRawMessage,
} from "@forge/cad-contracts";

/**
 * Base adapter — subclasses implement vendor parsing/normalization.
 * Must never write Forge incidents.
 */
export abstract class BaseCadAdapter implements CadAdapter {
  abstract readonly manifest: CadAdapterManifest;

  validateConfiguration(configuration: unknown): CadConfigurationValidationResult {
    if (
      configuration === null ||
      typeof configuration !== "object" ||
      Array.isArray(configuration)
    ) {
      return {
        valid: false,
        errors: [{ path: "$", message: "configuration must be an object" }],
        warnings: [],
      };
    }
    return { valid: true, errors: [], warnings: [] };
  }

  abstract authenticateMessage(
    request: CadInboundRequest,
    context: CadConnectionContext,
  ): Promise<CadAuthenticationResult>;

  abstract parseRawMessage(
    message: CadRawMessage,
    payloadBytes: Uint8Array,
  ): Promise<CadParsedPayload>;

  abstract normalize(
    parsed: CadParsedPayload,
    context: CadNormalizationContext,
  ): Promise<CadNormalizationResult>;

  buildAcknowledgement(result: CadProcessingResult): CadAcknowledgement {
    const httpStatus =
      result.outcome === "ACCEPTED" || result.outcome === "DUPLICATE"
        ? 202
        : result.outcome === "REJECTED_AUTHENTICATION"
          ? 401
          : result.outcome === "REJECTED_VALIDATION" || result.outcome === "UNSUPPORTED_VERSION"
            ? 400
            : 500;

    return {
      outcome: result.outcome,
      httpStatus,
      body: {
        outcome: result.outcome,
        correlationId: result.correlationId,
        rawMessageId: result.rawMessageId ?? null,
        summary: result.summary ?? null,
      },
    };
  }

  async testConnection(_context: CadConnectionContext): Promise<CadHealthResult> {
    return {
      healthy: false,
      status: "UNKNOWN",
      checkedAt: new Date().toISOString(),
      detail: "testConnection not implemented for this adapter",
    };
  }
}
