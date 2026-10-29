import { TrainingPublicWorkspace } from "@/components/training-public-workspace";

/** Preferred public route: /training/access/{token} */
export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function TrainingAccessTokenPage() {
  return <TrainingPublicWorkspace />;
}
