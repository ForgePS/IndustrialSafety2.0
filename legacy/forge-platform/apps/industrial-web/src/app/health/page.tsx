export default function HealthPage() {
  return (
    <pre aria-label="Industrial readiness">
      {JSON.stringify(
        {
          status: "healthy",
          service: "industrial-web",
          product: "FORGE_INDUSTRIAL",
          environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local",
          version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0-ind1",
          apiPath: "/api/v1/industrial/readiness",
          productionCutover: false,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      )}
    </pre>
  );
}
