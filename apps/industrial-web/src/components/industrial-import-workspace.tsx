"use client";

import { useEffect, useState } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";

type ImportTemplate = { templateKey: string; displayName: string; description: string };

export function IndustrialImportWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!(me?.permissions ?? []).includes("import.view")) return;
    setLoading(true);
    apiGet<{ items: ImportTemplate[] }>("/api/v1/imports/templates?productKey=FORGE_INDUSTRIAL")
      .then((data) => setTemplates(data.items))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : "Unable to load import templates"))
      .finally(() => setLoading(false));
  }, [me]);

  return (
    <section aria-labelledby="import-title">
      <ModuleWorkspaceHeader
        id="import-title"
        eyebrow="Coordination"
        title={moduleName}
        description="This workspace uses the Universal Import API and its existing jobs, mappings, validation, and execution pipeline."
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card border shadow-none">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Template</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.templateKey}>
                  <td>{template.displayName}</td>
                  <td className="text-muted">{template.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
