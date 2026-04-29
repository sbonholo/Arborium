"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import ProgressBar from "@/components/ProgressBar";
import PaymentModal from "@/components/PaymentModal";

// Canvas component requires browser APIs — load client-only
const MosaicPreview = dynamic(() => import("@/components/MosaicPreview"), { ssr: false });

interface Cell {
  index: number;
  photoUrl: string | null;
  cells: number;
}

interface Props {
  initialFilled: number;
  initialPurchases: number;
  initialCells: Cell[];
}

export default function LandingClient({ initialFilled, initialPurchases, initialCells }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0d0d0d" }}>
      {/* ── NAV ── */}
      <nav
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "#1a1a1a" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🇺🇸</span>
          <span className="font-bold tracking-wide text-white text-sm uppercase">
            Trump Mosaic
          </span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary text-xs py-2 px-4"
        >
          Claim My Spot
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="flex-1 flex flex-col lg:flex-row items-stretch gap-0 max-w-7xl mx-auto w-full px-4 pt-10 pb-16 lg:gap-12 lg:items-start">
        {/* LEFT — mosaic preview */}
        <div className="w-full lg:w-1/2 lg:sticky lg:top-8">
          <MosaicPreview filledCells={initialCells} totalFilled={initialFilled} />
          <p className="text-xs text-center mt-3" style={{ color: "#3a3a3a" }}>
            Far away: a portrait. Up close: 1,000,000 supporters.
          </p>
        </div>

        {/* RIGHT — info + CTA */}
        <div className="w-full lg:w-1/2 pt-6 lg:pt-0 flex flex-col gap-8">
          {/* Headline */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "#c9a84c" }}
            >
              A once-in-a-lifetime gift
            </p>
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
              1,000,000 Trump
              <br />
              <span style={{ color: "#c9a84c" }}>Supporters.</span>
              <br />
              One Historic Portrait.
            </h1>
            <p className="mt-4 text-gray-400 leading-relaxed">
              We are building a monumental photomosaic portrait of Donald Trump — made entirely
              from the faces of his supporters. At the end, we will frame it and send it to him
              as a gift.
            </p>
          </div>

          {/* Progress */}
          <div
            className="p-5 rounded-xl"
            style={{ background: "#111", border: "1px solid #1e1e1e" }}
          >
            <ProgressBar filled={initialFilled} />
            {initialPurchases > 0 && (
              <p className="text-xs text-gray-700 mt-3">
                {initialPurchases.toLocaleString()} supporters have already joined.
              </p>
            )}
          </div>

          {/* CTA block */}
          <div
            className="p-5 rounded-xl space-y-4"
            style={{ background: "#111", border: "1px solid #1e1e1e" }}
          >
            <div>
              <p className="text-white font-semibold">Ready to be part of history?</p>
              <p className="text-sm text-gray-500 mt-1">
                Start at $2 for a single cell. Buy more cells for a larger photo in the final portrait.
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="btn-primary w-full text-center"
            >
              🇺🇸 Claim My Spot — Starting at $2
            </button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span style={{ color: "#c9a84c" }}>✓</span> Secure Stripe payment
            </span>
            <span className="flex items-center gap-1">
              <span style={{ color: "#c9a84c" }}>✓</span> One-time fee, no subscription
            </span>
            <span className="flex items-center gap-1">
              <span style={{ color: "#c9a84c" }}>✓</span> Photo used only in this portrait
            </span>
            <span className="flex items-center gap-1">
              <span style={{ color: "#c9a84c" }}>✓</span> Final print sent to President Trump
            </span>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        className="py-16 px-6"
        style={{ background: "#0a0a0a", borderTop: "1px solid #1a1a1a" }}
      >
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-10 text-center"
            style={{ color: "#c9a84c" }}
          >
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Choose Your Space",
                desc: "Pick a tier from 1 cell ($2) up to 100 cells ($200). More cells = bigger photo in the portrait.",
              },
              {
                step: "02",
                title: "Pay Securely",
                desc: "One-time payment via Stripe. Credit card, Apple Pay, or Google Pay accepted.",
              },
              {
                step: "03",
                title: "Upload Your Photo",
                desc: "After payment you'll upload one clear selfie. Your face becomes part of the mosaic.",
              },
              {
                step: "04",
                title: "History Is Made",
                desc: "When all 1,000,000 cells are filled we print, frame, and personally deliver the portrait to Donald Trump.",
              },
            ].map((item) => (
              <div key={item.step} className="flex flex-col gap-3">
                <span className="text-4xl font-bold" style={{ color: "#1e1e1e" }}>
                  {item.step}
                </span>
                <h3 className="text-white font-semibold">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MISSION ── */}
      <section className="py-16 px-6" style={{ borderTop: "1px solid #1a1a1a" }}>
        <div className="max-w-2xl mx-auto text-center space-y-5">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#c9a84c" }}>
            The Mission
          </p>
          <h2 className="text-3xl font-bold text-white">
            Show him 1,000,000 faces.
          </h2>
          <p className="text-gray-500 leading-relaxed">
            Words can only say so much. This portrait says it all — a million Americans standing
            behind their President, each one a real person, each one a real face. When it's
            complete we will have it professionally printed at monumental scale, museum-framed,
            and delivered to Donald Trump as a gift from his supporters.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary mx-auto inline-block"
          >
            Add My Face →
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        className="py-8 px-6 text-center text-xs text-gray-700"
        style={{ borderTop: "1px solid #1a1a1a" }}
      >
        <p>TrumpMosaic.com · Not affiliated with Donald Trump or his campaign.</p>
        <p className="mt-1">Photos are used solely for the mosaic portrait and never sold or shared.</p>
      </footer>

      {/* ── PAYMENT MODAL ── */}
      {showModal && <PaymentModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
