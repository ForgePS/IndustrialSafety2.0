"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCameraScanner } from "@/components/qr-camera-scanner";
import { clearRecentScans, readRecentScans, type RecentScanItem } from "@/lib/scan-public";
import { targetTypeLabel } from "@/lib/scan-routes";

export default function ScanPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentScanItem[]>([]);

  useEffect(() => {
    setRecent(readRecentScans(8));
  }, []);

  return (
    <>
      <h1 className="ff-page-title">Scan QR</h1>
      <p className="ff-page-body">
        Point your camera at any Forge QR. Forge decides what it is — you do not pick a module.
      </p>
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}
      <QrCameraScanner
        autoStart
        onError={setError}
        onToken={(token) => {
          setError(null);
          router.push(`/scan/${encodeURIComponent(token)}/`);
        }}
      />
      {recent.length > 0 ? (
        <section className="ff-section" aria-labelledby="recent-scans">
          <div className="ff-section-head">
            <h2 id="recent-scans" className="ff-section-title ff-section-title--inline">
              Scan history
            </h2>
            <button
              type="button"
              className="ff-link-btn"
              onClick={() => {
                clearRecentScans();
                setRecent([]);
              }}
            >
              Clear
            </button>
          </div>
          <div className="ff-recent-list">
            {recent.map((item) => (
              <button
                key={`${item.token}-${item.at}`}
                type="button"
                className="ff-recent-item"
                onClick={() => router.push(`/scan/${encodeURIComponent(item.token)}/`)}
              >
                {item.label}
                {item.targetType ? (
                  <span className="ff-meta">{targetTypeLabel(item.targetType)}</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
