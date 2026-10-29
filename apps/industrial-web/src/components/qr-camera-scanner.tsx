"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractTokenFromQrText } from "@/lib/scan-public";

type Props = {
  onToken: (token: string) => void;
  onError?: (message: string) => void;
};

export function QrCameraScanner({ onToken, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [busy, setBusy] = useState(false);

  const stopCamera = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  async function startCamera() {
    setBusy(true);
    onError?.("Camera access is not available on this device. Enter the scan link manually.");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError?.("Camera access is not available on this device. Enter the scan link manually.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
    } catch {
      onError?.("Could not open the camera. Check permissions or enter the code manually.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const detectorCtor = (
      globalThis as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
        };
      }
    ).BarcodeDetector;
    if (!detectorCtor) return;

    const detector = new detectorCtor({ formats: ["qr_code"] });
    let cancelled = false;
    const tick = async () => {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const raw = codes[0]?.rawValue;
        const token = raw ? extractTokenFromQrText(raw) : null;
        if (token) {
          stopCamera();
          onToken(token);
          return;
        }
      } catch {
        // ignore intermittent detector errors
      }
      if (!cancelled) window.setTimeout(() => void tick(), 450);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [active, onToken, stopCamera]);

  function submitManual() {
    const token = extractTokenFromQrText(manualToken) ?? manualToken.trim();
    if (!token || token.length < 16) {
      onError?.("Enter a valid scan URL or token from the QR sticker.");
      return;
    }
    onToken(token);
  }

  return (
    <div className="card border shadow-none">
      <div className="card-body">
        <h6 className="mb-2">Scan QR code</h6>
        <p className="small text-muted mb-3">
          Point your camera at a Forge QR sticker, or paste the scan link if the camera is
          unavailable.
        </p>
        {active ? (
          <div className="mb-3">
            <video
              ref={videoRef}
              className="w-100 rounded border"
              style={{ maxHeight: "320px", objectFit: "cover" }}
              playsInline
              muted
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mt-2"
              onClick={stopCamera}
            >
              Stop camera
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm mb-3"
            disabled={busy}
            onClick={() => void startCamera()}
          >
            {busy ? "Opening camera…" : "Open camera scanner"}
          </button>
        )}
        <div className="row g-2 align-items-end">
          <div className="col-md-8">
            <label className="form-label small" htmlFor="scan-manual-token">
              Manual entry
            </label>
            <input
              id="scan-manual-token"
              className="form-control form-control-sm"
              placeholder="https://…/scan/… or token"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm w-100"
              onClick={submitManual}
            >
              Go
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
