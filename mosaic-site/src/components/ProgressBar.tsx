"use client";

import { useEffect, useState } from "react";

interface Props {
  filled: number;
  total?: number;
}

export default function ProgressBar({ filled, total = 1_000_000 }: Props) {
  const [displayed, setDisplayed] = useState(0);
  const pct = Math.min((filled / total) * 100, 100);

  // Animate counter on mount
  useEffect(() => {
    if (filled === 0) return;
    const step = Math.ceil(filled / 60);
    let cur = 0;
    const id = setInterval(() => {
      cur = Math.min(cur + step, filled);
      setDisplayed(cur);
      if (cur >= filled) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [filled]);

  const remaining = total - filled;

  return (
    <div className="w-full space-y-3">
      <div className="flex justify-between items-baseline">
        <span className="text-3xl font-bold tabular-nums" style={{ color: "#c9a84c" }}>
          {displayed.toLocaleString()}
          <span className="text-lg font-normal text-gray-400"> / {total.toLocaleString()}</span>
        </span>
        <span className="text-sm text-gray-500">
          {remaining.toLocaleString()} spots left
        </span>
      </div>

      {/* Bar track */}
      <div className="w-full h-2 rounded-full" style={{ background: "#1e1e1e" }}>
        <div
          className="progress-bar-fill rounded-full"
          style={{ width: `${pct}%`, minWidth: pct > 0 ? "4px" : 0 }}
        />
      </div>

      <p className="text-xs text-gray-600 text-right">
        {pct.toFixed(4)}% complete
      </p>
    </div>
  );
}
