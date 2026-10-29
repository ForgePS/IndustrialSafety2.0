"use client";

type DemoTile = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "success" | "warning" | "danger" | "info";
  icon: string;
  walkthrough?: string;
};

const ATTENTION: DemoTile[] = [
  {
    id: "open-incidents",
    label: "Open incidents",
    value: "4",
    detail: "2 under investigation",
    tone: "danger",
    icon: "bx-error",
    walkthrough: "dashboard-incidents",
  },
  {
    id: "training",
    label: "Training due soon",
    value: "18",
    detail: "Next 30 days",
    tone: "warning",
    icon: "bx-book",
    walkthrough: "dashboard-training",
  },
  {
    id: "inspections",
    label: "Inspections due",
    value: "7",
    detail: "Mill + warehouse",
    tone: "info",
    icon: "bx-check-shield",
    walkthrough: "dashboard-inspections",
  },
  {
    id: "corrective",
    label: "Open corrective actions",
    value: "9",
    detail: "3 overdue",
    tone: "warning",
    icon: "bx-wrench",
  },
];

const MODULES: Array<{ title: string; blurb: string; icon: string }> = [
  {
    title: "Safety & Incidents",
    blurb: "Report, investigate, and close the loop.",
    icon: "bx-error",
  },
  {
    title: "Lockout / Tagout",
    blurb: "Equipment procedures and active lockouts.",
    icon: "bx-lock-alt",
  },
  {
    title: "Emergency Alert SMS",
    blurb: "Notify the right people in seconds.",
    icon: "bx-message",
  },
  { title: "Fleet Tracking", blurb: "Vehicles, assignments, and renewals.", icon: "bx-car" },
  {
    title: "CDL Qualifications",
    blurb: "Department of Transportation driver files and documents.",
    icon: "bx-id-card",
  },
  { title: "Company Drivers", blurb: "MVR, license, and insurance roster.", icon: "bx-user-check" },
  {
    title: "PPE Tracking",
    blurb: "Prescription safety glasses and safety footwear.",
    icon: "bx-glasses",
  },
  { title: "Training", blurb: "Assignments, completions, and expirations.", icon: "bx-book" },
];

/**
 * Curated Producers Rice Mill executive view used during the walkthrough
 * instead of the signed-in user's personalized My Workspace layout.
 */
export function WalkthroughDemoDashboard() {
  return (
    <div
      className="ind-content ind-dashboard exec-walkthrough-demo-dash"
      data-walkthrough="executive-dashboard"
    >
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-uppercase text-muted small mb-1">Producers Rice Mill</p>
          <h4 className="mb-1">Executive Safety Dashboard</h4>
          <p className="text-muted mb-0">
            Demo overview prepared for Producers Rice Mill leadership — safety activity, training,
            inspections, and compliance across mill operations.
          </p>
        </div>
        <div className="badge bg-label-primary align-self-start">Producers demo</div>
      </div>

      <div className="row g-3 mb-4">
        {ATTENTION.map((tile) => (
          <div className="col-12 col-sm-6 col-xl-3" key={tile.id}>
            <div
              className={`card h-100 border-0 shadow-none exec-walkthrough-demo-tile tone-${tile.tone}`}
              {...(tile.walkthrough ? { "data-walkthrough": tile.walkthrough } : {})}
            >
              <div className="card-body">
                <div className="d-flex align-items-start justify-content-between gap-2">
                  <div>
                    <p className="text-muted small mb-1">{tile.label}</p>
                    <p className="display-6 mb-1">{tile.value}</p>
                    <p className="small mb-0">{tile.detail}</p>
                  </div>
                  <span className={`avatar avatar-sm bg-label-${tile.tone}`}>
                    <i className={`bx ${tile.icon}`} aria-hidden="true" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card border-0 shadow-none mb-4">
        <div className="card-body">
          <h5 className="mb-1">Safety index</h5>
          <p className="text-muted small mb-3">
            Trailing 12 months across Producers Rice Mill sites
          </p>
          <div className="d-flex flex-wrap align-items-end gap-4">
            <div>
              <p className="display-5 mb-0 text-success">92</p>
              <p className="small text-muted mb-0">Company score</p>
            </div>
            <div className="flex-grow-1" style={{ minWidth: "12rem" }}>
              <div className="progress" style={{ height: "0.65rem" }}>
                <div className="progress-bar bg-success" style={{ width: "92%" }} />
              </div>
              <div className="d-flex justify-content-between small text-muted mt-2">
                <span>Incidents trending down</span>
                <span>Training completion 94%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h5 className="mb-3">Connected modules</h5>
      <div className="row g-3">
        {MODULES.map((mod) => (
          <div className="col-12 col-md-6 col-xl-4" key={mod.title}>
            <div className="card h-100 border-0 shadow-none">
              <div className="card-body d-flex gap-3">
                <span className="avatar bg-label-primary">
                  <i className={`bx ${mod.icon}`} aria-hidden="true" />
                </span>
                <div>
                  <h6 className="mb-1">{mod.title}</h6>
                  <p className="text-muted small mb-0">{mod.blurb}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
