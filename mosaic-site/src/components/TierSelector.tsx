"use client";

import { TIERS, type TierId } from "@/lib/mosaic";

interface Props {
  selected: TierId;
  onChange: (id: TierId) => void;
}

export default function TierSelector({ selected, onChange }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "#c9a84c" }}>
        Choose your space
      </h3>

      <div className="grid grid-cols-1 gap-2">
        {TIERS.map((tier) => {
          const isSelected = tier.id === selected;
          return (
            <button
              key={tier.id}
              onClick={() => onChange(tier.id)}
              className="tier-card text-left flex items-center justify-between gap-4 w-full"
              style={
                isSelected
                  ? { borderColor: "#c9a84c", background: "#1f1a0d", boxShadow: "0 0 0 1px #c9a84c" }
                  : {}
              }
            >
              {/* Visual size indicator */}
              <div className="flex items-center gap-3 flex-1">
                <div
                  className="rounded-sm flex-shrink-0"
                  style={{
                    width: `${Math.min(Math.sqrt(tier.cells) * 8, 48)}px`,
                    height: `${Math.min(Math.sqrt(tier.cells) * 8, 48)}px`,
                    background: isSelected ? "#c9a84c" : "#3a3a3a",
                    transition: "background 0.15s",
                  }}
                />
                <div>
                  <div className="font-semibold text-white text-sm">
                    {tier.label}{" "}
                    <span className="text-gray-500 font-normal text-xs ml-1">{tier.size}</span>
                  </div>
                  <div className="text-gray-500 text-xs">
                    {tier.cells.toLocaleString()} {tier.cells === 1 ? "cell" : "cells"} · your photo
                    {tier.cells > 1 ? ` appears ${Math.sqrt(tier.cells).toFixed(0)}× larger` : ""}
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div
                  className="text-lg font-bold"
                  style={{ color: isSelected ? "#c9a84c" : "#f5f5f5" }}
                >
                  ${tier.priceUsd}
                </div>
                <div className="text-xs text-gray-600">${(tier.priceUsd / tier.cells).toFixed(2)}/cell</div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-600 pt-1">
        All tiers are one-time payments. Larger tiers display your photo bigger in the final portrait.
      </p>
    </div>
  );
}
