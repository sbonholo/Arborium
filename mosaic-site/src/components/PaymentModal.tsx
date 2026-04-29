"use client";

import { useState } from "react";
import TierSelector from "./TierSelector";
import { TIERS, type TierId } from "@/lib/mosaic";

interface Props {
  onClose: () => void;
}

export default function PaymentModal({ onClose }: Props) {
  const [tierId, setTierId] = useState<TierId>("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tier = TIERS.find((t) => t.id === tierId)!;

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Payment failed. Please try again.");
      }
      const { url } = await res.json();
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Claim Your Spot</h2>
            <p className="text-sm text-gray-500 mt-1">
              Choose a size, pay once, then upload your photo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-white text-2xl leading-none ml-4 flex-shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tier selection */}
        <TierSelector selected={tierId} onChange={setTierId} />

        {/* Summary */}
        <div
          className="mt-5 p-4 rounded-lg flex items-center justify-between"
          style={{ background: "#0d0d0d", border: "1px solid #2a2a2a" }}
        >
          <div>
            <div className="text-white font-semibold">{tier.label} — {tier.size} block</div>
            <div className="text-gray-500 text-sm">
              {tier.cells.toLocaleString()} cells · one photo · permanent
            </div>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#c9a84c" }}>
            ${tier.priceUsd}
          </div>
        </div>

        {/* Fee transparency */}
        <p className="text-xs text-gray-700 mt-2">
          Secure payment via Stripe. Your photo is kept private until the portrait is complete.
        </p>

        {error && (
          <div className="mt-3 p-3 rounded text-sm" style={{ background: "#2a0a0a", color: "#f87171", border: "1px solid #5a1a1a" }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleCheckout}
          disabled={loading}
          className="btn-primary w-full mt-5"
        >
          {loading ? "Redirecting to payment…" : `Pay $${tier.priceUsd} →`}
        </button>
      </div>
    </div>
  );
}
