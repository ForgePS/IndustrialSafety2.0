/** Hard project guard — refuse any project other than authorized source. */
export const EXPECTED_PROJECT = "forge-industrial-safety" as const;

export class ProjectGuardError extends Error {
  constructor(actual: string) {
    super(
      `PROJECT_GUARD FAIL: expected ${EXPECTED_PROJECT}, got ${actual || "(empty)"}. Refusing extract.`,
    );
    this.name = "ProjectGuardError";
  }
}

export function assertAuthorizedProject(
  actual: string | undefined | null,
): asserts actual is typeof EXPECTED_PROJECT {
  const normalized = (actual ?? "").trim();
  if (normalized !== EXPECTED_PROJECT) {
    throw new ProjectGuardError(normalized);
  }
}

export function resolveProjectId(cliProject?: string): string {
  const fromCli = cliProject?.trim();
  const fromEnv =
    process.env.FIREBASE_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    "";
  const actual = fromCli || fromEnv;
  assertAuthorizedProject(actual);
  return actual;
}
