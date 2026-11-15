/**
 * Vitest setup — production config fails closed without FORGE_PRODUCTION_ACCOUNT.
 * Unit tests validate structure against the approved production account only.
 */
process.env.FORGE_PRODUCTION_ACCOUNT ??= "511343547817";
