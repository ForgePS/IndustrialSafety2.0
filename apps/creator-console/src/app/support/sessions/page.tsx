"use client";

import { useState } from "react";
import { Alert, ComingLater, FormField, FormSection, ForgePageHeader } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import styles from "../../page.module.css";

function SupportSessionsInner() {
  const [reason, setReason] = useState("");
  const [customer, setCustomer] = useState("");

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Access Sessions"
        subtitle="Open an audited support session to help a customer without using AWS Console."
      />
      <Alert tone="info">
        Support sessions must be audited with customer, product, and reason. A live session API is
        not connected yet — do not use informal workarounds for customer access.
      </Alert>
      <div className={styles.panel}>
        <FormSection title="Open Support Session">
          <FormField label="Customer" htmlFor="customer" required>
            <input
              id="customer"
              className="forge-input"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Customer display name"
            />
          </FormField>
          <FormField label="Product" htmlFor="product">
            <select id="product" className="forge-select" defaultValue="FORGE_INDUSTRIAL">
              <option value="FORGE_INDUSTRIAL">Forge Industrial Safety</option>
              <option value="FORGE_RMS">Forge RMS</option>
              <option value="FORGE_ACADEMY">Forge Academy</option>
            </select>
          </FormField>
          <FormField
            label="Reason"
            htmlFor="reason"
            required
            hint="Example: Customer requested assistance configuring inspection templates."
          >
            <textarea
              id="reason"
              className="forge-textarea"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
        </FormSection>
        <ComingLater>
          Start Session is unavailable until the support-session API and banner are wired. Use
          customer Open Application with platform-admin audited access where already provided.
        </ComingLater>
      </div>
    </section>
  );
}

export default function SupportSessionsPage() {
  return (
    <PlatformPageGate title="Access Sessions" permission="platform.tenant.read">
      <SupportSessionsInner />
    </PlatformPageGate>
  );
}
