"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type Stage = "idle" | "processing" | "preview" | "uploading" | "confirming" | "done" | "invalid";
type InputMode = "upload" | "camera";
type CameraState = "idle" | "starting" | "active" | "captured" | "error";

const MAX_RAW_BYTES = 50 * 1024 * 1024; // 50 MB raw input limit (any phone photo)

// Target dimensions for stored photo: sized for the 75" print and digital zoom
const CELL_PX = 128; // 128×128 px → ~5 KB stored, 4× the ~15×15 px print cell

export default function UploadClient() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");

  const [stage, setStage] = useState<Stage>("idle");
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [originalSizeKb, setOriginalSizeKb] = useState(0);
  const [processedSizeKb, setProcessedSizeKb] = useState(0);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Camera state
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState("");
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  // Track display name for preview stage (null → rawFile.name, string → selfie label)
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) setStage("invalid");
  }, [sessionId]);

  // Attach stream to video element once both are ready
  useEffect(() => {
    if (cameraState === "active" && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraState]);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Camera controls ──────────────────────────────────────────

  async function startCamera() {
    setCameraError("");
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraState("active");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isPermission = /permission|denied|not allowed/i.test(msg);
      setCameraError(
        isPermission
          ? "Camera access was denied. Please allow camera access in your browser settings and try again."
          : "Could not access the camera. Make sure no other app is using it, then try again."
      );
      setCameraState("error");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement("canvas");
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d")!;
    // Mirror horizontally to match the natural "selfie mirror" feel
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Could not capture — please try again.");
          return;
        }
        capturedBlobRef.current = blob;
        if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
        const url = URL.createObjectURL(blob);
        setCapturedPreviewUrl(url);
        setCameraState("captured");
      },
      "image/jpeg",
      0.95
    );
  }

  async function useCapturedPhoto() {
    const blob = capturedBlobRef.current;
    if (!blob) return;

    setErrorMsg("");
    setRawFile(null);
    setDisplayName("Selfie");
    setOriginalSizeKb(Math.round(blob.size / 1024));
    setStage("processing");
    stopCamera();

    try {
      const processed = await resizeAndCompress(blob, CELL_PX, 0.82);
      setProcessedBlob(processed);
      setProcessedSizeKb(Math.round(processed.size / 1024));
      const url = URL.createObjectURL(processed);
      setPreviewUrl(url);
      setStage("preview");
    } catch {
      setErrorMsg("Could not process the captured photo. Please try again.");
      setStage("idle");
    }
  }

  function switchInputMode(mode: InputMode) {
    if (inputMode === mode) return;
    // Clean up camera when leaving camera tab
    if (inputMode === "camera") {
      stopCamera();
      setCameraState("idle");
      setCameraError("");
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
        setCapturedPreviewUrl(null);
      }
      capturedBlobRef.current = null;
    }
    setInputMode(mode);
    if (mode === "camera") startCamera();
  }

  // ── File upload controls ─────────────────────────────────────

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];

    const isImage = f.type.startsWith("image/") || f.name.match(/\.(jpe?g|png|webp|heic|heif)$/i);
    if (!isImage) {
      setErrorMsg("Please choose a photo (JPEG, PNG, WebP, or HEIC).");
      return;
    }
    if (f.size > MAX_RAW_BYTES) {
      setErrorMsg("File is too large. Maximum 50 MB.");
      return;
    }

    setErrorMsg("");
    setRawFile(f);
    setDisplayName(null);
    setOriginalSizeKb(Math.round(f.size / 1024));
    setStage("processing");

    try {
      const blob = await resizeAndCompress(f, CELL_PX, 0.82);
      setProcessedBlob(blob);
      setProcessedSizeKb(Math.round(blob.size / 1024));
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setStage("preview");
    } catch {
      setErrorMsg("Could not process your photo. Please try a different image.");
      setStage("idle");
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload() {
    if (!processedBlob || !sessionId) return;
    setStage("uploading");
    setProgress(0);

    try {
      // Retry up to 8× (12 s total) in case the Stripe webhook hasn't written the
      // purchase row yet when the user taps "Upload" immediately after payment.
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const { photo_url } = await postBlobWithProgress(
            processedBlob,
            `/api/upload?session_id=${encodeURIComponent(sessionId)}`,
            setProgress
          );
          setPhotoUrl(photo_url);
          setStage("done");
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const isPurchaseNotFound = lastError.message.toLowerCase().includes("not found");
          if (!isPurchaseNotFound) break;
          // Wait 1.5 s before retrying (webhook may still be processing)
          await new Promise((r) => setTimeout(r, 1500));
          setProgress(0);
        }
      }
      throw lastError ?? new Error("Upload failed.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setStage("preview");
    }
  }

  function reset() {
    setRawFile(null);
    setDisplayName(null);
    setProcessedBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStage("idle");
    setProgress(0);
    setOriginalSizeKb(0);
    setProcessedSizeKb(0);
    setErrorMsg("");
    // Restart camera if returning to camera tab
    if (inputMode === "camera") {
      setCameraState("idle");
      startCamera();
    }
  }

  // ── INVALID ──────────────────────────────────────────────────
  if (stage === "invalid") {
    return (
      <Shell>
        <div className="modal-box text-center space-y-4">
          <p className="text-3xl">⚠️</p>
          <h1 className="text-white text-xl font-bold">No session found</h1>
          <p className="text-gray-400 text-sm">
            This link requires a valid payment session. Please use the link from your success page.
          </p>
          <Link href="/" className="btn-primary inline-block">← Back to home</Link>
        </div>
      </Shell>
    );
  }

  // ── DONE ─────────────────────────────────────────────────────
  if (stage === "done") {
    return (
      <Shell>
        <div className="modal-box text-center space-y-6" style={{ maxWidth: "460px" }}>
          <p className="text-5xl">🎉</p>
          <h1 className="text-white text-2xl font-bold">You&apos;re in the portrait!</h1>
          <p className="text-gray-400 text-sm">
            Your face has been added to the mosaic. When all 1,000,000 spots are filled,
            we&apos;ll print, frame, and deliver it to Donald Trump.
          </p>
          {photoUrl && (
            <div className="rounded-lg overflow-hidden w-32 h-32 mx-auto" style={{ outline: "2px solid #c9a84c" }}>
              <Image src={photoUrl} alt="Your uploaded photo" width={128} height={128} className="object-cover w-full h-full" />
            </div>
          )}
          <Link href="/" className="btn-primary inline-block">View the mosaic →</Link>
        </div>
      </Shell>
    );
  }

  // ── PROCESSING (client-side resize) ──────────────────────────
  if (stage === "processing") {
    return (
      <Shell>
        <div className="modal-box text-center space-y-4" style={{ maxWidth: "400px" }}>
          <Spinner />
          <p className="text-white font-semibold">Optimizing your photo…</p>
          <p className="text-gray-600 text-sm">Resizing to mosaic size. This takes under a second.</p>
        </div>
      </Shell>
    );
  }

  // ── UPLOADING ────────────────────────────────────────────────
  if (stage === "uploading" || stage === "confirming") {
    return (
      <Shell>
        <div className="modal-box space-y-6" style={{ maxWidth: "420px" }}>
          <h2 className="text-white text-xl font-bold text-center">Uploading your photo…</h2>
          {previewUrl && (
            <div className="w-32 h-32 mx-auto rounded-full overflow-hidden" style={{ outline: "2px solid #c9a84c" }}>
              <Image src={previewUrl} alt="Preview" width={128} height={128} className="object-cover w-full h-full" />
            </div>
          )}
          <div className="w-full h-2 rounded-full" style={{ background: "#1e1e1e" }}>
            <div
              className="progress-bar-fill rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-gray-600 text-sm text-center">{progress}%</p>
        </div>
      </Shell>
    );
  }

  // ── PREVIEW ───────────────────────────────────────────────────
  if (stage === "preview" && previewUrl) {
    const name = displayName ?? rawFile?.name ?? "photo.jpg";
    return (
      <Shell>
        <div className="modal-box space-y-5" style={{ maxWidth: "480px" }}>
          <h2 className="text-white text-xl font-bold">Looks good?</h2>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0" style={{ outline: "2px solid #c9a84c" }}>
              <Image src={previewUrl} alt="Preview" width={96} height={96} className="object-cover w-full h-full" />
            </div>
            <div className="space-y-1">
              <p className="text-white text-sm font-semibold truncate max-w-[200px]">{name}</p>
              <div className="text-xs space-y-0.5">
                <p className="text-gray-600">
                  Original: <span className="text-gray-400">{originalSizeKb.toLocaleString()} KB</span>
                </p>
                <p className="text-gray-600">
                  Stored at: <span style={{ color: "#c9a84c" }}>{processedSizeKb} KB</span>
                  {originalSizeKb > 0 && (
                    <span className="text-gray-700 ml-1">
                      ({Math.round((1 - processedSizeKb / originalSizeKb) * 100)}% smaller)
                    </span>
                  )}
                </p>
                <p className="text-gray-700 text-xs">{CELL_PX}×{CELL_PX} px — optimized for 75&quot; print</p>
              </div>
              <button onClick={reset} className="text-xs pt-1" style={{ color: "#c9a84c" }}>
                {displayName === "Selfie" ? "Retake selfie" : "Choose a different photo"}
              </button>
            </div>
          </div>

          <ul className="text-sm text-gray-500 space-y-1">
            <li className="flex gap-2"><span style={{ color: "#c9a84c" }}>✓</span> Your face is clearly visible</li>
            <li className="flex gap-2"><span style={{ color: "#c9a84c" }}>✓</span> Good lighting, no heavy shadows</li>
            <li className="flex gap-2"><span style={{ color: "#c9a84c" }}>✓</span> This photo will be public in the mosaic</li>
          </ul>

          {errorMsg && <ErrorBox msg={errorMsg} />}

          <button onClick={handleUpload} className="btn-primary w-full">
            Upload &amp; Claim My Spot →
          </button>
        </div>
      </Shell>
    );
  }

  // ── IDLE ─────────────────────────────────────────────────────
  return (
    <Shell>
      <div className="modal-box space-y-6" style={{ maxWidth: "480px" }}>
        {/* Header */}
        <div className="text-center space-y-2">
          {sessionId && (
            <p
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: "#0f1a0f", color: "#4ade80", border: "1px solid #1a3a1a" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Payment confirmed
            </p>
          )}
          <h1 className="text-white text-2xl font-bold">Upload Your Photo</h1>
          <p className="text-gray-500 text-sm">
            Any size, any resolution — we auto-optimize it for the portrait.
          </p>
        </div>

        {/* Mode toggle */}
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ background: "#0a0a0a", border: "1px solid #1e1e1e" }}
        >
          <ModeTab
            active={inputMode === "upload"}
            onClick={() => switchInputMode("upload")}
            label="Upload a Photo"
            icon="📁"
          />
          <ModeTab
            active={inputMode === "camera"}
            onClick={() => switchInputMode("camera")}
            label="Take a Selfie"
            icon="📷"
          />
        </div>

        {/* ── Upload mode ── */}
        {inputMode === "upload" && (
          <>
            <div
              className={`dropzone ${dragging ? "active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="space-y-3 pointer-events-none">
                <p className="text-4xl">📸</p>
                <p className="text-white font-semibold">
                  {dragging ? "Drop it here!" : "Drag your photo here"}
                </p>
                <p className="text-gray-600 text-sm">or click to browse your files</p>
                <p className="text-gray-700 text-xs">
                  Any format · Any resolution · Up to 50 MB
                  <br />We compress it automatically to ~5 KB
                </p>
              </div>
            </div>

            {errorMsg && <ErrorBox msg={errorMsg} />}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-700">Photo tips</p>
              <ul className="text-xs text-gray-600 space-y-1">
                {[
                  "Look straight at the camera",
                  "Good lighting — daylight or bright indoor light",
                  "Your face should fill most of the frame",
                  "Avoid sunglasses or heavy filters",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <span style={{ color: "#3a3a3a" }}>·</span>{t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-xs text-gray-700 p-3 rounded" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
              <span style={{ color: "#c9a84c" }}>🖼 Print spec:</span> The final 75&quot; portrait needs ~15×15 px per cell
              at 300 DPI. We store your photo at {CELL_PX}×{CELL_PX} px (4× quality margin) for crisp digital zoom
              and high-quality print compositing.
            </div>
          </>
        )}

        {/* ── Camera mode ── */}
        {inputMode === "camera" && (
          <div className="space-y-4">
            {/* Starting */}
            {cameraState === "starting" && (
              <div className="flex flex-col items-center gap-3 py-10">
                <Spinner />
                <p className="text-gray-400 text-sm">Starting camera…</p>
              </div>
            )}

            {/* Live viewfinder */}
            {(cameraState === "active" || cameraState === "captured") && (
              <>
                {/* Video — always in DOM while stream active; hidden after capture */}
                <div
                  className="relative rounded-xl overflow-hidden"
                  style={{
                    display: cameraState === "captured" ? "none" : "block",
                    aspectRatio: "4/3",
                    background: "#000",
                  }}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  {/* Shutter button */}
                  <div className="absolute inset-x-0 bottom-5 flex justify-center">
                    <button
                      onClick={capturePhoto}
                      aria-label="Capture photo"
                      className="w-16 h-16 rounded-full flex items-center justify-center transition-transform active:scale-90"
                      style={{
                        background: "#c9a84c",
                        boxShadow: "0 0 0 4px rgba(201,168,76,0.3), 0 0 0 7px rgba(255,255,255,0.15)",
                      }}
                    >
                      <span
                        className="block w-8 h-8 rounded-full"
                        style={{ background: "#fff", opacity: 0.9 }}
                      />
                    </button>
                  </div>
                </div>

                {/* Captured preview + actions */}
                {cameraState === "captured" && capturedPreviewUrl && (
                  <div className="space-y-4">
                    <div
                      className="relative mx-auto rounded-xl overflow-hidden"
                      style={{ aspectRatio: "1/1", maxWidth: "280px", background: "#000", outline: "2px solid #c9a84c" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={capturedPreviewUrl}
                        alt="Captured selfie"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setCameraState("active")}
                        className="flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors"
                        style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#999" }}
                      >
                        ↩ Retake
                      </button>
                      <button
                        onClick={useCapturedPhoto}
                        className="btn-primary text-sm py-2.5"
                        style={{ flex: 2 }}
                      >
                        Use This Photo →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Camera error */}
            {cameraState === "error" && (
              <div className="space-y-4">
                <ErrorBox msg={cameraError} />
                <button onClick={startCamera} className="btn-primary w-full">
                  Try Again
                </button>
                <p className="text-xs text-center text-gray-700">
                  Or{" "}
                  <button
                    onClick={() => switchInputMode("upload")}
                    className="underline"
                    style={{ color: "#c9a84c" }}
                  >
                    upload a photo instead
                  </button>
                </p>
              </div>
            )}

            {/* Idle (shouldn't normally show — camera auto-starts) */}
            {cameraState === "idle" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-5xl">📷</p>
                <button onClick={startCamera} className="btn-primary">
                  Start Camera
                </button>
              </div>
            )}

            {/* Tip shown below viewfinder */}
            {(cameraState === "active") && (
              <p className="text-xs text-center text-gray-700">
                Center your face in the frame · Tap the shutter button to capture
              </p>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

// ── Sub-components ────────────────────────────────────────────

function ModeTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors"
      style={
        active
          ? { background: "#c9a84c", color: "#0d0d0d" }
          : { color: "#555", background: "transparent" }
      }
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "#0d0d0d" }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="w-10 h-10 rounded-full border-2 mx-auto animate-spin"
      style={{ borderColor: "#c9a84c", borderTopColor: "transparent" }}
    />
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="p-3 rounded text-sm" style={{ background: "#2a0a0a", color: "#f87171", border: "1px solid #5a1a1a" }}>
      {msg}
    </div>
  );
}

/**
 * Client-side image processing:
 * 1. createImageBitmap() decodes the image and auto-applies EXIF rotation
 *    (fixes upside-down phone selfies without needing exif-js)
 * 2. Center-crop to square, resize to targetPx × targetPx
 * 3. Export as JPEG at the given quality (0–1)
 */
async function resizeAndCompress(source: Blob | File, targetPx: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(source);

  const canvas = document.createElement("canvas");
  canvas.width = targetPx;
  canvas.height = targetPx;
  const ctx = canvas.getContext("2d")!;

  // Center-crop: take the largest square from the center of the image
  const { width: w, height: h } = bitmap;
  const cropSize = Math.min(w, h);
  const sx = (w - cropSize) / 2;
  const sy = (h - cropSize) / 2;

  ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, targetPx, targetPx);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed."))),
      "image/jpeg",
      quality
    );
  });
}

/** POST raw JPEG bytes with XHR so we get upload progress events */
function postBlobWithProgress(
  blob: Blob,
  url: string,
  onProgress: (pct: number) => void
): Promise<{ photo_url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.photo_url) {
          resolve(data as { photo_url: string });
        } else {
          reject(new Error(data.error ?? `Upload failed (HTTP ${xhr.status}).`));
        }
      } catch {
        reject(new Error(`Upload failed: HTTP ${xhr.status}.`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "image/jpeg");
    xhr.send(blob);
  });
}

