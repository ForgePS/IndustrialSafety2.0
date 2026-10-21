import { TrainingAssignmentClient } from "./training-assignment-client";

export function generateStaticParams() {
  return [{ assignmentId: "placeholder" }];
}

export default function TrainingAssignmentPage() {
  return <TrainingAssignmentClient />;
}
