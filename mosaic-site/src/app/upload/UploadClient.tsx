"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type Stage = "idle" | "processing" | "preview" | "uploading" | "confirming" | "done" | "invalid";

// Accept any image — we process it in-browser before upload
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
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

  useEffect(() => {
    if (!sessionId) setStage("invalid");
  }, [sessionId]);

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
      // 1. Get presigned R2 URL for the already-processed tiny JPEG
      const initRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          file_type: "image/jpeg",
          file_size: processedBlob.size,
        }),
      });
      if (!initRes.ok) {
        const d = await initRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not start upload.");
      }
      const { upload_url, key } = await initRes.json();

      // 2. PUT directly to Cloudflare R2 with progress tracking
      await uploadWithProgress(upload_url, processedBlob, "image/jpeg", setProgress);

      // 3. Confirm so the database is updated
      setStage("confirming");
      const confirmRes = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, key }),
      });
      if (!confirmRes.ok) {
        const d = await confirmRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not confirm upload.");
      }
      const { photo_url } = await confirmRes.json();
      setPhotoUrl(photo_url);
      setStage("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setStage("preview");
    }
  }

  function reset() {
    setRawFile(null);
    setProcessedBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStage("idle");
    setProgress(0);
    setOriginalSizeKb(0);
    setProcessedSizeKb(0);
    setErrorMsg("");
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

  // ── UPLOADING / CONFIRMING ────────────────────────────────────
  if (stage === "uploading" || stage === "confirming") {
    return (
      <Shell>
        <div className="modal-box space-y-6" style={{ maxWidth: "420px" }}>
          <h2 className="text-white text-xl font-bold text-center">
            {stage === "uploading" ? "Uploading your photo…" : "Saving your spot…"}
          </h2>
          {previewUrl && (
            <div className="w-32 h-32 mx-auto rounded-full overflow-hidden" style={{ outline: "2px solid #c9a84c" }}>
              <Image src={previewUrl} alt="Preview" width={128} height={128} className="object-cover w-full h-full" />
            </div>
          )}
          <div className="w-full h-2 rounded-full" style={{ background: "#1e1e1e" }}>
            <div
              className="progress-bar-fill rounded-full transition-all"
              style={{ width: stage === "confirming" ? "100%" : `${progress}%` }}
            />
          </div>
          <p className="text-gray-600 text-sm text-center">
            {stage === "confirming" ? "Almost done…" : `${progress}%`}
          </p>
        </div>
      </Shell>
    );
  }

  // ── PREVIEW ───────────────────────────────────────────────────
  if (stage === "preview" && previewUrl) {
    return (
      <Shell>
        <div className="modal-box space-y-5" style={{ maxWidth: "480px" }}>
          <h2 className="text-white text-xl font-bold">Looks good?</h2>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0" style={{ outline: "2px solid #c9a84c" }}>
              <Image src={previewUrl} alt="Preview" width={96} height={96} className="object-cover w-full h-full" />
            </div>
            <div className="space-y-1">
              <p className="text-white text-sm font-semibold truncate max-w-[200px]">{rawFile?.name}</p>
              <div className="text-xs space-y-0.5">
                <p className="text-gray-600">
                  Original: <span className="text-gray-400">{originalSizeKb.toLocaleString()} KB</span>
                </p>
                <p className="text-gray-600">
                  Stored at: <span style={{ color: "#c9a84c" }}>{processedSizeKb} KB</span>
                  <span className="text-gray-700 ml-1">
                    ({Math.round((1 - processedSizeKb / originalSizeKb) * 100)}% smaller)
                  </span>
                </p>
                <p className="text-gray-700 text-xs">{CELL_PX}×{CELL_PX} px — optimized for 75&quot; print</p>
              </div>
              <button onClick={reset} className="text-xs pt-1" style={{ color: "#c9a84c" }}>
                Choose a different photo
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
            Upload & Claim My Spot →
          </button>
        </div>
      </Shell>
    );
  }

  // ── IDLE (drop zone) ─────────────────────────────────────────
  return (
    <Shell>
      <div className="modal-box space-y-6" style={{ maxWidth: "480px" }}>
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#c9a84c" }}>Step 2 of 2</p>
          <h1 className="text-white text-2xl font-bold">Upload Your Photo</h1>
          <p className="text-gray-500 text-sm">
            Any size, any resolution — we auto-optimize it for the portrait.
          </p>
        </div>

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
              <br />We compress it automatically to ~{Math.round(CELL_PX * CELL_PX * 0.82 / 1024)} KB
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
      </div>
    </Shell>
  );
}

// ── Helpers ───────────────────────────────────────────────────

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
async function resizeAndCompress(file: File, targetPx: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

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

/** XHR upload so we get progress events */
function uploadWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(blob);
  });
}
