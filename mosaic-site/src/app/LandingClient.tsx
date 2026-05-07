"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import ProgressBar from "@/components/ProgressBar";
import PaymentModal from "@/components/PaymentModal";

const MosaicViewer = dynamic(() => import("@/components/MosaicViewer"), { ssr: false });

interface Props {
  initialFilled: number;
  initialPurchases: number;
}

export default function LandingClient({ initialFilled, initialPurchases }: Props) {
  const params = useSearchParams();
  const cellParam = params.get("cell");
  const highlightCell = cellParam !== null ? parseInt(cellParam, 10) : null;

  const [showModal, setShowModal] = useState(false);
  const [liveFilled, setLiveFilled] = useState(initialFilled);

  const handleTotalFilled = useCallback((n: number) => {
    setLiveFilled(n);
  }, []);

  return (
    <div style={{ background: "#0d0d0d" }}>

      {/* ── VIEWPORT HERO (mosaic fills the screen) ── */}
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>

        {/* Nav */}
        <nav
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ background: "rgba(13,13,13,0.95)", borderBottom: "1px solid #1a1a1a" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🇺🇸</span>
            <span className="font-bold tracking-wide text-white text-sm uppercase">
              Trump Mosaic
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
              <span className="text-xs text-gray-600">Live</span>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="btn-primary text-xs py-2 px-4"
            >
              Claim My Spot
            </button>
          </div>
        </nav>

        {/* Mosaic canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <MosaicViewer highlightCell={highlightCell} onTotalFilled={handleTotalFilled} />

          {/* Bottom gradient overlay: progress + CTA */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: "linear-gradient(to top, rgba(13,13,13,0.97) 0%, rgba(13,13,13,0.85) 45%, transparent 100%)",
              padding: "56px 20px 20px",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            <div
              style={{
                maxWidth: 480,
                margin: "0 auto",
                pointerEvents: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <ProgressBar filled={liveFilled} />
              {initialPurchases > 0 && (
                <p className="text-xs text-center" style={{ color: "#3a3a3a" }}>
                  {initialPurchases.toLocaleString()} supporters have already joined
                </p>
              )}
              <button
                onClick={() => setShowModal(true)}
                className="btn-primary w-full"
              >
                🇺🇸 Claim My Spot — Starting at $2
              </button>
              <p className="text-xs text-center" style={{ color: "#2a2a2a" }}>
                Far away: a portrait. Up close: 1,000,000 supporters.
              </p>
            </div>
          </div>
        </div>
      </div>

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

      {/* ── INFO + CTA ── */}
      <section className="py-16 px-6" style={{ borderTop: "1px solid #1a1a1a" }}>
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Headline */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "#c9a84c" }}
            >
              A once-in-a-lifetime gift
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold text-white leading-tight">
              1,000,000 Trump{" "}
              <span style={{ color: "#c9a84c" }}>Supporters.</span>
              <br />
              One Historic Portrait.
            </h2>
            <p className="mt-4 text-gray-400 leading-relaxed">
              We are building a monumental photomosaic portrait of Donald Trump — made entirely
              from the faces of his supporters. At the end, we will frame it and send it to him
              as a gift.
            </p>
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

          {/* Donation callout */}
          <div
            className="p-4 rounded-xl flex items-start gap-3"
            style={{ background: "#0f0f0f", border: "1px solid #2a2010" }}
          >
            <span className="text-lg flex-shrink-0">🎗️</span>
            <p className="text-sm leading-relaxed" style={{ color: "#c9a84c" }}>
              <span className="font-semibold">A portion of every purchase</span>{" "}
              <span style={{ color: "#a08030" }}>
                will be donated to support the Republican campaign in the next election.
                Every dollar you spend helps grow this mosaic <em>and</em> funds the fight for America.
              </span>
            </p>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            {[
              "Secure Stripe payment",
              "One-time fee, no subscription",
              "Photo used only in this portrait",
              "Final print sent to President Trump",
              "Part of proceeds donated to the Republican campaign",
            ].map((badge) => (
              <span key={badge} className="flex items-center gap-1">
                <span style={{ color: "#c9a84c" }}>✓</span> {badge}
              </span>
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
            behind their President, each one a real person, each one a real face. When it&apos;s
            complete we will have it professionally printed at monumental scale, museum-framed,
            and delivered to Donald Trump as a gift from his supporters.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#7a6020" }}>
            A portion of every purchase is donated to support the Republican campaign in the next
            election — so your $2 does double duty.
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

      {showModal && <PaymentModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
