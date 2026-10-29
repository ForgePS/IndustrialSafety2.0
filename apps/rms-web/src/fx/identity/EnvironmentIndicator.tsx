export type RmsEnvironmentKind = "development" | "test" | "staging" | "production" | "unknown";

export function classifyEnvironment(raw: string | undefined): RmsEnvironmentKind {
  const value = (raw ?? "").toLowerCase();
  if (!value || value === "local" || value === "dev" || value === "development")
    return "development";
  if (value === "test" || value === "testing") return "test";
  if (value === "staging" || value === "stage") return "staging";
  if (value === "production" || value === "prod") return "production";
  return "unknown";
}

export function EnvironmentIndicator({ environment }: { environment: string | undefined }) {
  const kind = classifyEnvironment(environment);
  if (kind === "production") {
    return (
      <span className="rms-fx-env rms-fx-env--production" data-testid="rms-fx-environment">
        Production
      </span>
    );
  }
  const label =
    kind === "development"
      ? "Development"
      : kind === "test"
        ? "Test"
        : kind === "staging"
          ? "Staging"
          : "Unknown environment";
  return (
    <span className={`rms-fx-env rms-fx-env--${kind}`} data-testid="rms-fx-environment">
      {label}
    </span>
  );
}
