import { DvirPublicWorkspace } from "@/components/dvir-public-workspace";

/** Static export shell for path tokens; CloudFront rewrites unknown tokens here. */
export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function DvirTokenPage() {
  return <DvirPublicWorkspace />;
}
