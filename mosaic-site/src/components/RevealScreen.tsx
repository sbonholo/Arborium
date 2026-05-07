"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Phase = "intro" | "zoom" | "landed";

const GRID = 1000;
const CONFETTI_COLORS = ["#c9a84c", "#ffe08a", "#ffffff", "#b8001f", "#002868"];

interface Particle {
  id: number;
  x: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  isCircle: boolean;
  rotate: number;
}

function Confetti() {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 55 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 2.2,
        duration: 2.5 + Math.random() * 2,
        size: 7 + Math.random() * 9,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        isCircle: Math.random() > 0.4,
        rotate: Math.random() * 360,
      })),
    []
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: -20,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.isCircle ? "50%" : 2,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in both`,
          }}
        />
      ))}
    </div>
  );
}

export default function RevealScreen({
  photoUrl,
  cellIndex,
}: {
  photoUrl: string;
  cellIndex: number | null;
}) {
  const [phase, setPhase] = useState<Phase>("intro");

  const col = cellIndex !== null ? cellIndex % GRID : 500;
  const row = cellIndex !== null ? Math.floor(cellIndex / GRID) : 350;
  // Clamp origin so extreme corners don't feel odd on any screen size
  const originX = `${Math.max(5, Math.min(95, ((col + 0.5) / GRID) * 100)).toFixed(1)}%`;
  const originY = `${Math.max(5, Math.min(95, ((row + 0.5) / GRID) * 100)).toFixed(1)}%`;

  const mosaicHref = cellIndex !== null ? `/?cell=${cellIndex}` : "/";

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("zoom"), 1200);
    const t2 = setTimeout(() => setPhase("landed"), 4300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
          100% { opacity: 0; transform: translateY(110vh) rotate(720deg) scale(0.5); }
        }
        @keyframes revealFadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes goldRingPulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(201,168,76,0.2), 0 0 32px rgba(201,168,76,0.5); }
          50%       { box-shadow: 0 0 0 10px rgba(201,168,76,0.35), 0 0 64px rgba(201,168,76,0.75); }
        }
      `}</style>

      <div style={{ position: "fixed", inset: 0, background: "#0d0d0d", overflow: "hidden" }}>

        {/* ── Portrait (CSS zoom toward user's cell) ── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: `${originX} ${originY}`,
            transform: phase === "landed" ? "scale(18)" : "scale(1)",
            transition: phase === "zoom" ? "transform 3.1s cubic-bezier(0.2, 0, 0.05, 1)" : "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/trump-portrait.jpg"
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>

        {/* ── Vignette / darkening ── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse at 50% 38%, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.88) 100%)",
            opacity: phase === "landed" ? 0.6 : 1,
            transition: "opacity 1.3s ease",
          }}
        />

        {/* ── Intro text (fades out as zoom begins) ── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: phase === "intro" ? 1 : 0,
            transition: "opacity 0.5s ease",
            pointerEvents: "none",
          }}
        >
          <p
            style={{
              color: "#c9a84c",
              fontSize: "1.25rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textShadow: "0 0 32px rgba(201,168,76,0.65), 0 2px 12px rgba(0,0,0,0.9)",
            }}
          >
            Placing you in the portrait…
          </p>
        </div>

        {/* ── Landed: photo + celebration ── */}
        {phase === "landed" && (
          <>
            <Confetti />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "1.5rem",
                padding: "1.5rem",
                animation: "revealFadeUp 0.7s ease both",
              }}
            >
              {/* Gold ring + photo */}
              <div
                style={{
                  borderRadius: "50%",
                  padding: 3,
                  background:
                    "linear-gradient(135deg, #7a4f10 0%, #ffe08a 30%, #c9a84c 50%, #ffe08a 70%, #7a4f10 100%)",
                  animation: "goldRingPulse 2.5s ease-in-out infinite",
                }}
              >
                <div
                  style={{
                    width: 152,
                    height: 152,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "#111",
                  }}
                >
                  <Image
                    src={photoUrl}
                    alt="Your photo in the mosaic"
                    width={152}
                    height={152}
                    style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
                  />
                </div>
              </div>

              {/* Headline */}
              <div style={{ textAlign: "center" }}>
                <h1
                  style={{
                    color: "#fff",
                    fontSize: "clamp(1.6rem, 6vw, 2.6rem)",
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: "-0.02em",
                    textShadow: "0 2px 28px rgba(0,0,0,0.9)",
                  }}
                >
                  You&apos;re in the portrait!
                </h1>
                {cellIndex !== null && (
                  <p style={{ color: "#555", fontSize: "0.82rem", marginTop: 8, margin: "8px 0 0" }}>
                    Supporter #{(cellIndex + 1).toLocaleString()} of 1,000,000
                  </p>
                )}
              </div>

              {/* CTA */}
              <Link href={mosaicHref} className="btn-primary" style={{ display: "inline-block" }}>
                See My Spot in the Mosaic →
              </Link>
              <Link
                href="/"
                style={{ color: "#3a3a3a", fontSize: "0.75rem", textDecoration: "none" }}
              >
                Back to home
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
