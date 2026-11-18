"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TenantRequired } from "@/components/tenant-required";
import { apiGet } from "@/lib/api";
import styles from "../page.module.css";

type Person = {
  id: string;
  forgePersonNumber: string;
  displayName: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  status: string;
  recordSource: string;
};

function PersonDetailInner() {
  const searchParams = useSearchParams();
  const personId = searchParams.get("personId");
  const tenantId = searchParams.get("tenantId");

  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(Boolean(tenantId && personId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !personId) return;
    setLoading(true);
    setError(null);
    try {
      setPerson(await apiGet<Person>(`/api/v1/tenants/${tenantId}/persons/${personId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load person");
    } finally {
      setLoading(false);
    }
  }, [tenantId, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenantId || !personId) {
    return (
      <section className={styles.page}>
        <h1>Person detail</h1>
        <TenantRequired />
      </section>
    );
  }

  const q = `?tenantId=${encodeURIComponent(tenantId)}`;

  return (
    <section className={styles.page}>
      <h1>Person detail</h1>
      <p className={styles.lead}>
        <Link href={`/persons${q}`}>← Persons</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {person ? (
        <div className={styles.panel}>
          <h2>{person.displayName}</h2>
          <dl className={styles.dl}>
            <dt>ID</dt>
            <dd className={styles.mono}>{person.id}</dd>
            <dt>Forge #</dt>
            <dd className={styles.mono}>{person.forgePersonNumber}</dd>
            <dt>First name</dt>
            <dd>{person.firstName}</dd>
            <dt>Middle name</dt>
            <dd>{person.middleName ?? "—"}</dd>
            <dt>Last name</dt>
            <dd>{person.lastName}</dd>
            <dt>Suffix</dt>
            <dd>{person.suffix ?? "—"}</dd>
            <dt>Preferred name</dt>
            <dd>{person.preferredName ?? "—"}</dd>
            <dt>Email</dt>
            <dd>{person.email ?? "—"}</dd>
            <dt>Phone</dt>
            <dd>{person.phone ?? "—"}</dd>
            <dt>Date of birth</dt>
            <dd>{person.dateOfBirth ?? "—"}</dd>
            <dt>Status</dt>
            <dd>{person.status}</dd>
            <dt>Record source</dt>
            <dd>{person.recordSource}</dd>
          </dl>
        </div>
      ) : null}
    </section>
  );
}

export default function PersonDetailPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <PersonDetailInner />
    </Suspense>
  );
}
