"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/field-states";

export default function IncidentNewPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/report/incident/");
  }, [router]);
  return <LoadingState label="Opening incident report…" />;
}
