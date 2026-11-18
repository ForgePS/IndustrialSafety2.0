"use client";

import type { FormEvent } from "react";
import type { OshaForm300AMeta } from "@/lib/osha-module";
import { FORM_300A } from "@/lib/osha-form-copy";

type Props = {
  meta: OshaForm300AMeta;
  canManage: boolean;
  saving: boolean;
  onChange: (next: OshaForm300AMeta) => void;
  onSave: () => Promise<void>;
};

export function Form300AEditor({ meta, canManage, saving, onChange, onSave }: Props) {
  function set<K extends keyof OshaForm300AMeta>(key: K, value: OshaForm300AMeta[K]) {
    onChange({ ...meta, [key]: value });
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    await onSave();
  }

  return (
    <form className="card mb-4 osha-form-300a-editor" onSubmit={onSubmit}>
      <div className="card-header">
        <h3 className="h5 mb-0">Form 300A establishment information</h3>
        <p className="small text-muted mb-0 mt-1">
          Employment figures and certification for year {meta.year}. Case totals (G–M) are
          calculated from the Form 300 log.
        </p>
      </div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="f300a-name">
              {FORM_300A.labels.establishmentName}
            </label>
            <input
              id="f300a-name"
              className="form-control"
              value={meta.establishmentName}
              disabled={!canManage}
              onChange={(ev) => set("establishmentName", ev.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="f300a-street">
              {FORM_300A.labels.street}
            </label>
            <input
              id="f300a-street"
              className="form-control"
              value={meta.street}
              disabled={!canManage}
              onChange={(ev) => set("street", ev.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f300a-city">
              {FORM_300A.labels.city}
            </label>
            <input
              id="f300a-city"
              className="form-control"
              value={meta.city}
              disabled={!canManage}
              onChange={(ev) => set("city", ev.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label className="form-label" htmlFor="f300a-state">
              {FORM_300A.labels.state}
            </label>
            <input
              id="f300a-state"
              className="form-control"
              value={meta.state}
              disabled={!canManage}
              onChange={(ev) => set("state", ev.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label className="form-label" htmlFor="f300a-zip">
              {FORM_300A.labels.zip}
            </label>
            <input
              id="f300a-zip"
              className="form-control"
              value={meta.zip}
              disabled={!canManage}
              onChange={(ev) => set("zip", ev.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f300a-naics">
              NAICS
            </label>
            <input
              id="f300a-naics"
              className="form-control"
              value={meta.naics}
              maxLength={6}
              disabled={!canManage}
              onChange={(ev) => set("naics", ev.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="f300a-industry">
              {FORM_300A.labels.industryDescription}
            </label>
            <input
              id="f300a-industry"
              className="form-control"
              value={meta.industryDescription}
              disabled={!canManage}
              onChange={(ev) => set("industryDescription", ev.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f300a-avg">
              {FORM_300A.labels.annualAverageEmployees}
            </label>
            <input
              id="f300a-avg"
              type="number"
              min={0}
              className="form-control"
              value={meta.annualAverageEmployees ?? ""}
              disabled={!canManage}
              onChange={(ev) =>
                set(
                  "annualAverageEmployees",
                  ev.target.value === "" ? null : Number(ev.target.value),
                )
              }
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f300a-hours">
              {FORM_300A.labels.totalHoursWorked}
            </label>
            <input
              id="f300a-hours"
              type="number"
              min={0}
              className="form-control"
              value={meta.totalHoursWorked ?? ""}
              disabled={!canManage}
              onChange={(ev) =>
                set("totalHoursWorked", ev.target.value === "" ? null : Number(ev.target.value))
              }
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f300a-date">
              {FORM_300A.labels.date}
            </label>
            <input
              id="f300a-date"
              type="date"
              className="form-control"
              value={meta.certificationDate ?? ""}
              disabled={!canManage}
              onChange={(ev) => set("certificationDate", ev.target.value || null)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f300a-exec">
              {FORM_300A.labels.companyExecutive}
            </label>
            <input
              id="f300a-exec"
              className="form-control"
              value={meta.companyExecutive}
              disabled={!canManage}
              onChange={(ev) => set("companyExecutive", ev.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f300a-title">
              {FORM_300A.labels.title}
            </label>
            <input
              id="f300a-title"
              className="form-control"
              value={meta.executiveTitle}
              disabled={!canManage}
              onChange={(ev) => set("executiveTitle", ev.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="f300a-phone">
              {FORM_300A.labels.phone}
            </label>
            <input
              id="f300a-phone"
              className="form-control"
              value={meta.phone}
              disabled={!canManage}
              onChange={(ev) => set("phone", ev.target.value)}
            />
          </div>
        </div>
        {canManage ? (
          <div className="d-flex justify-content-end mt-3">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save Form 300A information"}
            </button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
