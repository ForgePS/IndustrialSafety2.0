import { LotoClient } from "./loto-client";

export function generateStaticParams() {
  return [{ machineId: "placeholder" }];
}

export default function LotoPage() {
  return <LotoClient />;
}
