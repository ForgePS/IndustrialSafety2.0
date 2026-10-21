"use client";

import { useState, type FormEvent } from "react";
import { apiSend } from "@forge/web-kit";
import { formatApiErrorMessage } from "@/lib/api-error";
import {
  normalizeSmsDigits,
  SMS_AUTHORIZATION_CONSENT_TEXT,
} from "@/lib/personnel-sms-authorization";

type SignupResult = {
  firstName: string | null;
  phoneMasked: string;
  phoneChanged: boolean;
  alreadyEnrolled: boolean;
  signedAt: string;
};

export function EmergencySmsSignupForm({ token }: { token: string }) {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignupResult | null>(null);

  const phoneDigits = normalizeSmsDigits(phone);
  const phoneOk = Boolean(phoneDigits && phoneDigits.length === 10);
  const canSubmit =
    employeeNumber.trim() && lastName.trim() && phoneOk && consent && signatureName.trim().length >= 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<SignupResult>(
        `/api/v1/public/scan/${encodeURIComponent(token)}/sms-signup`,
        "POST",
        {
          employeeNumber: employeeNumber.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          consent: true,
          signatureName: signatureName.trim(),
        },
      );
      setResult(res);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Signup could not be completed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="card border shadow-none mt-3">
        <div className="card-body text-center py-5">
          <i className="bx bx-check-circle text-success" style={{ fontSize: "3.5rem" }} aria-hidden />
          <h5 className="mt-2 mb-2">
            {result.firstName ? `You're signed up, ${result.firstName}.` : "You're signed up."}
          </h5>
          <p className="mb-1">
            Emergency alerts will be texted to <strong>{result.phoneMasked}</strong>.
          </p>
          {result.phoneChanged ? (
            <p className="small text-muted mb-1">
              Your SMS number on your personnel file was updated to this number.
            </p>
          ) : null}
          <p className="small text-muted mb-0">
            A signed copy of this form was saved to your personnel file. Reply STOP to any alert to
            unsubscribe.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="card border shadow-none mt-3" onSubmit={(e) => void submit(e)}>
      <div className="card-body">
        <h5 className="mb-1">Emergency SMS Alerts signup</h5>
        <p className="small text-muted mb-3">
          Get text messages about emergencies, severe weather, evacuations, and safety notices at
          work.
        </p>

        {error ? (
          <div className="alert alert-danger py-2" role="alert">
            {error}
          </div>
        ) : null}

        <div className="row g-3">
          <div className="col-sm-6">
            <label className="form-label" htmlFor="sms-signup-empno">
              Employee #
            </label>
            <input
              id="sms-signup-empno"
              className="form-control"
              required
              autoComplete="off"
              inputMode="text"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
            />
          </div>
          <div className="col-sm-6">
            <label className="form-label" htmlFor="sms-signup-lastname">
              Last name
            </label>
            <input
              id="sms-signup-lastname"
              className="form-control"
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="col-12">
            <label className="form-label" htmlFor="sms-signup-phone">
              Mobile number for alerts
            </label>
            <input
              id="sms-signup-phone"
              className={`form-control${phone && !phoneOk ? " is-invalid" : ""}`}
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 555-5555"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <div className="invalid-feedback">Enter a 10-digit US mobile number.</div>
            <div className="form-text">
              This becomes the SMS number on your personnel file.
            </div>
          </div>
        </div>

        <div
          className="border rounded p-3 mt-3 small bg-lighter"
          style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto" }}
        >
          {SMS_AUTHORIZATION_CONSENT_TEXT}
        </div>

        <div className="form-check mt-3">
          <input
            id="sms-signup-consent"
            className="form-check-input"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="sms-signup-consent">
            I have read and agree to receive Emergency SMS Alerts at the number above.
          </label>
        </div>

        <div className="mt-3">
          <label className="form-label" htmlFor="sms-signup-signature">
            Signature (type your full name)
          </label>
          <input
            id="sms-signup-signature"
            className="form-control"
            required
            autoComplete="name"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            style={{ fontFamily: "'Segoe Script', 'Brush Script MT', cursive", fontSize: "1.2rem" }}
          />
        </div>

        <button type="submit" className="btn btn-primary w-100 mt-4" disabled={busy || !canSubmit}>
          {busy ? "Submitting…" : "Sign and submit"}
        </button>
      </div>
    </form>
  );
}
