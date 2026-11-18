export default function HealthPage() {
  return (
    <pre>
      {JSON.stringify(
        {
          status: "healthy",
          service: "academy-web",
          environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? "local",
          version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      )}
    </pre>
  );
}
