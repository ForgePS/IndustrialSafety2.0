"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PlatformPageGate } from "@/components/platform-page-gate";
import styles from "../../page.module.css";

/** Legacy Add Customer entry — redirects into the guided onboarding wizard. */
export default function AddCustomerRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/onboarding/new/");
  }, [router]);

  return (
    <PlatformPageGate title="Add company" permission="platform.onboarding.manage">
      <section className={styles.page}>
        <p className={styles.muted}>Opening company setup…</p>
      </section>
    </PlatformPageGate>
  );
}
