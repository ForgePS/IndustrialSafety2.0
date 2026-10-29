"use client";

import dynamic from "next/dynamic";

const ConfigStudioPage = dynamic(
  () => import("@/components/config-studio").then((mod) => mod.ConfigStudioPage),
  {
    ssr: false,
    loading: () => <p>Loading configuration studio…</p>,
  },
);

export function DynamicConfigStudioPage(props: { namespace: string; title: string }) {
  return <ConfigStudioPage namespace={props.namespace} title={props.title} />;
}
