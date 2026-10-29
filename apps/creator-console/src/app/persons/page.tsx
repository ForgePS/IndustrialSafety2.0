"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { personDetailHref, tenantDetailHref } from "@/hooks/use-tenant-id";
import { TenantRequired } from "@/components/tenant-required";
import { apiGet, apiSend } from "@/lib/api";
import styles from "../page.module.css";

type Person = {
  id: string;
  forgePersonNumber: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
};

function PersonsInner() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");

  const [items, setItems] = useState<Person[]>([]);
  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await apiGet<Person[]>(`/api/v1/tenants/${tenantId}/persons`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load persons");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!tenantId) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSend(`/api/v1/tenants/${tenantId}/persons`, "POST", {
        firstName,
        lastName,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create person");
    } finally {
      setSubmitting(false);
    }
  }

  if (!tenantId) {
    return (
      <section className={styles.page}>
        <h1>Persons</h1>
        <TenantRequired />
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1>Persons</h1>
      <p className={styles.lead}>
        Tenant <span className={styles.mono}>{tenantId}</span> ·{" "}
        <Link href={tenantDetailHref(tenantId)}>Tenant detail</Link>
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <h2>Create person</h2>
        <form className={styles.form} onSubmit={onCreate}>
          <div className={styles.formRow}>
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label htmlFor="email">Email (optional)</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.panel}>
        <h2>Persons</h2>
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && items.length === 0 ? <p className={styles.muted}>No persons yet.</p> : null}
        {items.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Forge #</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((person) => (
                <tr key={person.id}>
                  <td>
                    <Link href={personDetailHref(person.id, tenantId)}>{person.displayName}</Link>
                  </td>
                  <td className={styles.mono}>{person.forgePersonNumber}</td>
                  <td>{person.email ?? "—"}</td>
                  <td>{person.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

export default function PersonsPage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <PersonsInner />
    </Suspense>
  );
}
