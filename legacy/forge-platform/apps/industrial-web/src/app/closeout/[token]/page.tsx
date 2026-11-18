import { CloseoutWorkspace } from "@/components/closeout-workspace";

/** Static export shell for path tokens; CloudFront rewrites unknown tokens here. */
export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export default function CloseoutTokenPage() {
  return <CloseoutWorkspace />;
}
