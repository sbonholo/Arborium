"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type Stage = "idle" | "preview" | "uploading" | "confirming" | "done" | "error" | "invalid";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export default function UploadClient() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");

  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) setStage("invalid");
  }, [sessionId]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!ACCEPTED.includes(f.type)) {
      setErrorMsg("Please use a JPEG, PNG, or WebP image.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setErrorMsg("File is too large. Maximum 10 MB.");
      return;
    }
    setErrorMsg("");
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStage("preview");
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload() {
    if (!file || !sessionId) return;
    setStage("uploading");
    setProgress(0);

    try {
      // 1. Get presigned URL from our API
      const initRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          file_type: file.type,
          file_size: file.size,
        }),
      });
      if (!initRes.ok) {
        const d = await initRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not start upload.");
      }
      const { upload_url, key } = await initRes.json();

      // 2. PUT the file directly to Cloudflare R2 with progress tracking
      await uploadWithProgress(upload_url, file, setProgress);

      // 3. Confirm with our API so we can update the database
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
      setStage("preview"); // let them retry
    }
  }

  function reset() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStage("idle");
    setProgress(0);
    setErrorMsg("");
  }

  // ── INVALID SESSION ──────────────────────────────────────────
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
          {/* Progress bar */}
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
            <div>
              <p className="text-white text-sm font-semibold">{file?.name}</p>
              <p className="text-gray-500 text-xs">{file ? (file.size / 1024 / 1024).toFixed(1) : 0} MB</p>
              <button onClick={reset} className="text-xs mt-2" style={{ color: "#c9a84c" }}>
                Choose a different photo
              </button>
            </div>
          </div>

          <ul className="text-sm text-gray-500 space-y-1">
            <li className="flex gap-2"><span style={{ color: "#c9a84c" }}>✓</span> Your face is clearly visible</li>
            <li className="flex gap-2"><span style={{ color: "#c9a84c" }}>✓</span> Good lighting, no heavy shadows</li>
            <li className="flex gap-2"><span style={{ color: "#c9a84c" }}>✓</span> This photo will be public in the mosaic</li>
          </ul>

          {errorMsg && (
            <div className="p-3 rounded text-sm" style={{ background: "#2a0a0a", color: "#f87171", border: "1px solid #5a1a1a" }}>
              {errorMsg}
            </div>
          )}

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
          <p className="text-gray-500 text-sm">One clear selfie. Your face joins the portrait.</p>
        </div>

        {/* Drop zone */}
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
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="space-y-3 pointer-events-none">
            <p className="text-4xl">📸</p>
            <p className="text-white font-semibold">
              {dragging ? "Drop it here!" : "Drag your photo here"}
            </p>
            <p className="text-gray-600 text-sm">or click to browse your files</p>
            <p className="text-gray-700 text-xs">JPEG · PNG · WebP · max 10 MB</p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded text-sm" style={{ background: "#2a0a0a", color: "#f87171", border: "1px solid #5a1a1a" }}>
            {errorMsg}
          </div>
        )}

        {/* Tips */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-700">Photo tips</p>
          <ul className="text-xs text-gray-600 space-y-1">
            {[
              "Look straight at the camera",
              "Good lighting — daylight or bright indoor",
              "Your face should fill most of the frame",
              "Avoid sunglasses or heavy filters",
            ].map((t) => <li key={t} className="flex gap-2"><span style={{ color: "#3a3a3a" }}>·</span>{t}</li>)}
          </ul>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "#0d0d0d" }}>
      {children}
    </div>
  );
}

// XMLHttpRequest-based upload so we can track progress
function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}
