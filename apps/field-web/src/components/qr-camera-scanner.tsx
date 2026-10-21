"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractTokenFromQrText } from "@/lib/scan-public";

type Props = {
  onToken: (token: string) => void;
  onError?: (message: string) => void;
  /** When true, open the camera as soon as the component mounts. */
  autoStart?: boolean;
};

type VideoDevice = { deviceId: string; label: string };

export function QrCameraScanner({ onToken, onError, autoStart = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [detectorMissing, setDetectorMissing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const deviceIdRef = useRef(deviceId);
  deviceIdRef.current = deviceId;

  const stopCamera = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list
        .filter((d) => d.kind === "videoinput")
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${index + 1}`,
        }));
      setDevices(cams);
      setDeviceId((prev) => prev || cams[0]?.deviceId || "");
    } catch {
      // ignore enumeration failures
    }
  }, []);

  const startCamera = useCallback(async () => {
    setBusy(true);
    setPermissionDenied(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setShowManual(true);
        onError?.("Camera is not available on this device. Enter the scan link manually.");
        return;
      }
      const preferredDeviceId = deviceIdRef.current;
      const videoConstraint: MediaTrackConstraints = preferredDeviceId
        ? { deviceId: { exact: preferredDeviceId } }
        : { facingMode: { ideal: "environment" } };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setTorchSupported(Boolean(caps?.torch));
      await refreshDevices();
    } catch (err) {
      const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermissionDenied(true);
        setShowManual(true);
        onError?.("Camera access is required to scan QR codes.");
      } else {
        setShowManual(true);
        onError?.("Could not open the camera. Check permissions or enter the code manually.");
      }
    } finally {
      setBusy(false);
    }
  }, [onError, refreshDevices]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStarted.current) {
      autoStarted.current = true;
      void startCamera();
    }
  }, [autoStart, startCamera]);

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
    if (!detectorCtor) {
      setDetectorMissing(true);
      setShowManual(true);
      return;
    }
    setDetectorMissing(false);
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

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      onError?.("Flashlight is not available on this camera.");
      setTorchSupported(false);
    }
  }

  async function switchCamera(nextId: string) {
    setDeviceId(nextId);
    stopCamera();
    // restart with new device on next tick
    window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: nextId } },
            audio: false,
          });
          streamRef.current = stream;
          setActive(true);
          const track = stream.getVideoTracks()[0];
          const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
          setTorchSupported(Boolean(caps?.torch));
        } catch {
          onError?.("Could not switch cameras.");
        } finally {
          setBusy(false);
        }
      })();
    }, 50);
  }

  function submitManual() {
    const token =
      extractTokenFromQrText(manualToken) ??
      (manualToken.trim().length >= 8 ? manualToken.trim() : null);
    if (!token) {
      onError?.("Enter a valid scan URL or token from the QR sticker.");
      return;
    }
    stopCamera();
    onToken(token);
  }

  return (
    <div>
      {permissionDenied ? (
        <div className="ff-state ff-state--error" role="alert">
          <h2 className="ff-page-title">Camera access required</h2>
          <p className="ff-page-body">
            Camera access is required to scan QR codes. Allow camera permission, or use manual entry.
          </p>
          <button type="button" className="ff-btn" onClick={() => setShowManual(true)}>
            Open manual entry
          </button>
        </div>
      ) : null}

      {active ? (
        <div className="ff-scan-frame">
          <video ref={videoRef} className="ff-scan-video" playsInline muted />
          <div className="ff-scan-reticle" aria-hidden="true" />
          <div className="ff-scan-controls">
            {torchSupported ? (
              <button type="button" className="ff-btn ff-btn-secondary" onClick={() => void toggleTorch()}>
                {torchOn ? "Flash off" : "Flash on"}
              </button>
            ) : null}
            <button type="button" className="ff-btn ff-btn-secondary" onClick={stopCamera}>
              Stop camera
            </button>
          </div>
        </div>
      ) : !permissionDenied ? (
        <button type="button" className="ff-scan-hero" disabled={busy} onClick={() => void startCamera()}>
          {busy ? "Opening camera…" : "OPEN CAMERA"}
        </button>
      ) : null}

      {devices.length > 1 && active ? (
        <label className="ff-org-field" style={{ marginTop: 12 }}>
          <span className="ff-org-label">Camera</span>
          <select
            className="ff-select"
            value={deviceId}
            onChange={(e) => void switchCamera(e.target.value)}
            aria-label="Camera selector"
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {detectorMissing && active ? (
        <p className="ff-hint">
          This browser cannot decode QR codes automatically. Paste the scan link below.
        </p>
      ) : null}

      <div className="ff-section">
        <button
          type="button"
          className="ff-link-btn"
          onClick={() => setShowManual((value) => !value)}
        >
          {showManual ? "Hide manual entry" : "Enter code manually"}
        </button>
        {showManual ? (
          <>
            <label className="ff-section-title" htmlFor="ff-manual-token">
              Manual entry
            </label>
            <input
              id="ff-manual-token"
              className="ff-input"
              style={{ width: "100%", marginBottom: 10 }}
              placeholder="Paste scan URL, /q/ code, or token"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              autoComplete="off"
            />
            <button type="button" className="ff-btn ff-btn-secondary" onClick={submitManual}>
              Go
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
