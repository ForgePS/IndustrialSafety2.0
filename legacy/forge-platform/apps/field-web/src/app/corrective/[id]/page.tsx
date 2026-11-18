import { CorrectiveClient } from "./corrective-client";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function CorrectivePage() {
  return <CorrectiveClient />;
}
