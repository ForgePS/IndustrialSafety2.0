import { industrialAvailabilityLabel } from "@forge/contracts";
import { moduleUnavailableMessage } from "@/lib/navigation";

export function ModuleUnavailable({
  moduleName,
  status = "LEGACY_ONLY",
}: {
  moduleName: string;
  status?: string;
}) {
  return (
    <section className="ind-unavailable" aria-labelledby="module-unavailable-title">
      <h1 id="module-unavailable-title">{moduleName}</h1>
      <p>{moduleUnavailableMessage(moduleName)}</p>
      <p className="ind-muted">Availability: {industrialAvailabilityLabel(status)}</p>
    </section>
  );
}
