"use client";

import { useEffect, useRef } from "react";

interface Cell {
  index: number;
  photoUrl: string | null;
  cells: number;
}

interface Props {
  filledCells: Cell[];
  totalFilled: number;
}

const GRID = 100; // 100×100 display grid (each square = 100 real cells)
const TOTAL_DISPLAY = GRID * GRID;

export default function MosaicPreview({ filledCells, totalFilled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = "/trump-portrait.svg";
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (imgRef.current) draw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filledCells, totalFilled]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cw = W / GRID;
    const ch = H / GRID;

    // Draw portrait as background reference
    ctx.drawImage(imgRef.current, 0, 0, W, H);

    // Overlay semi-transparent dark grid on empty cells
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 0.5;

    const filledSet = new Set<number>();
    filledCells.forEach((c) => {
      // Map real cell index to display cell index (100 real → 1 display)
      const displayIdx = Math.floor((c.index / 1_000_000) * TOTAL_DISPLAY);
      filledSet.add(displayIdx);
    });

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const idx = r * GRID + c;
        const x = c * cw;
        const y = r * ch;

        if (!filledSet.has(idx)) {
          // Empty cell — dark overlay so portrait shows through subtly
          ctx.fillStyle = "rgba(10,10,10,0.55)";
          ctx.fillRect(x, y, cw, ch);
        }
        // Grid lines
        ctx.strokeRect(x, y, cw, ch);
      }
    }

    // Draw gold shimmer on filled cells (photo images loaded async in Step 5)
    filledCells.forEach((c) => {
      const displayIdx = Math.floor((c.index / 1_000_000) * TOTAL_DISPLAY);
      const r = Math.floor(displayIdx / GRID);
      const col = displayIdx % GRID;
      const x = col * cw;
      const y = r * ch;
      const size = Math.min(Math.sqrt(c.cells), 10);
      ctx.fillStyle = "rgba(201,168,76,0.35)";
      ctx.fillRect(x, y, cw * size, ch * size);
    });
  }

  return (
    <div className="mosaic-wrapper rounded-lg overflow-hidden" style={{ aspectRatio: "500/580" }}>
      <canvas
        ref={canvasRef}
        width={500}
        height={580}
        className="mosaic-canvas w-full h-full"
        title="The mosaic fills in as supporters join"
      />
      <div
        className="absolute bottom-0 left-0 right-0 p-3 text-center text-xs"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))", color: "#c9a84c" }}
      >
        {totalFilled.toLocaleString()} / 1,000,000 spots filled
      </div>
    </div>
  );
}
