import { MyTrainingAssignmentClient } from "./my-training-assignment-client";

/** Static export shell; CloudFront rewrites unknown assignment ids here. */
export function generateStaticParams() {
  return [{ assignmentId: "placeholder" }];
}

export default function MyTrainingAssignmentPage() {
  return <MyTrainingAssignmentClient />;
}
