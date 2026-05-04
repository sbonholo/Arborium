"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

type Status = "loading" | "ready" | "already_uploaded" | "not_found" | "error";

interface PurchaseInfo {
  sessionId: string;
  cells: number;
  cellIndices: number[];
}

export default function SuccessClient() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get("session_id");

  const [status, setStatus] = useState<Status>("loading");
  const [purchase, setPurchase] = useState<PurchaseInfo | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setStatus("not_found");
      return;
    }
    poll(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function poll(sid: string, maxAttempts = 20) {
    setCanRetry(false);
    setStatus("loading");
    for (let i = 0; i < maxAttempts; i++) {
      setAttempts(i + 1);
      try {
        const res = await fetch(`/api/purchase-status?session_id=${sid}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found) {
            setPurchase(data);
            setStatus(data.photo_uploaded ? "already_uploaded" : "ready");
            return;
          }
        }
      } catch {
        // network error — keep polling
      }
      await sleep(1500);
    }
    setStatus("not_found");
    setCanRetry(true);
  }

  if (status === "loading") {
    return (
      <Centered>
        <div className="space-y-4 text-center">
          <Spinner />
          <p className="text-white text-lg">Confirming your payment…</p>
          <p className="text-gray-600 text-sm">
            {attempts > 1 ? `Still checking (attempt ${attempts}/20)…` : "This takes just a moment."}
          </p>
        </div>
      </Centered>
    );
  }

  if (status === "not_found" || status === "error") {
    return (
      <Centered>
        <div className="modal-box text-center space-y-4">
          <p className="text-2xl">⚠️</p>
          <h1 className="text-white text-xl font-bold">Payment not found yet</h1>
          <p className="text-gray-400 text-sm">
            Sometimes Stripe takes a few extra seconds. If you completed payment, check your
            email for a receipt and come back to this page.
          </p>
          {canRetry && sessionId && (
            <button
              onClick={() => poll(sessionId, 20)}
              className="btn-primary w-full"
            >
              Check Again
            </button>
          )}
          <Link href="/" className="block text-center text-sm text-gray-600 hover:text-gray-400">
            ← Back to home
          </Link>
        </div>
      </Centered>
    );
  }

  if (status === "already_uploaded") {
    return (
      <Centered>
        <div className="modal-box text-center space-y-4">
          <p className="text-4xl">✅</p>
          <h1 className="text-white text-2xl font-bold">You&apos;re in the portrait!</h1>
          <p className="text-gray-400">Your photo has already been uploaded. You&apos;re part of history.</p>
          <Link href="/mosaic" className="btn-primary inline-block">View the mosaic →</Link>
        </div>
      </Centered>
    );
  }

  // status === "ready" — show upload CTA
  return (
    <Centered>
      <div className="modal-box space-y-6" style={{ maxWidth: "480px" }}>
        {/* Success header */}
        <div className="text-center space-y-2">
          <p className="text-4xl">🇺🇸</p>
          <h1 className="text-white text-2xl font-bold">Payment confirmed!</h1>
          <p className="text-gray-400 text-sm">
            You reserved{" "}
            <span style={{ color: "#c9a84c" }}>
              {purchase?.cells.toLocaleString()} cell{(purchase?.cells ?? 1) > 1 ? "s" : ""}
            </span>{" "}
            in the mosaic. Now upload your photo to lock in your spot.
          </p>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #2a2a2a" }} />

        {/* Upload instructions */}
        <div className="space-y-3">
          <h2 className="text-white font-semibold">Upload your photo</h2>
          <ul className="text-sm text-gray-500 space-y-2">
            {[
              "One clear photo of your face (selfie works great)",
              "Good lighting — avoid shadows over your face",
              "JPEG or PNG, max 10 MB",
              "Your face should fill most of the frame",
            ].map((tip) => (
              <li key={tip} className="flex gap-2">
                <span style={{ color: "#c9a84c" }}>✓</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => router.push(`/upload?session_id=${sessionId}`)}
          className="btn-primary w-full"
        >
          Upload My Photo →
        </button>

        <p className="text-xs text-gray-700 text-center">
          Your upload link is tied to this session. Bookmark this page if you want to come back later.
        </p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0d0d0d" }}
    >
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="w-10 h-10 rounded-full border-2 border-t-transparent mx-auto animate-spin"
      style={{ borderColor: "#c9a84c", borderTopColor: "transparent" }}
    />
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
