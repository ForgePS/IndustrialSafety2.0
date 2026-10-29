import ReportTypeClient from "./report-type-client";

export function generateStaticParams() {
  return [
    { type: "hazard" },
    { type: "incident" },
    { type: "observation" },
    { type: "near-miss" },
    { type: "equipment" },
    { type: "security" },
  ];
}

export default function ReportTypePage() {
  return <ReportTypeClient />;
}
