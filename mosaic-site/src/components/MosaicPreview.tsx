"use client";

import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface Cell {
  index: number;
  photoUrl: string | null;
  cells: number;
}

interface Props {
  filledCells: Cell[];
  totalFilled: number;
  onNewCell?: (cell: Cell, newTotal: number) => void;
}

// Display grid: 100×100 squares, each representing 100 real cells (10×10 block)
const DISPLAY_GRID = 100;
const TOTAL_DISPLAY = DISPLAY_GRID * DISPLAY_GRID;

export default function MosaicPreview({ filledCells, totalFilled, onNewCell }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Offscreen portrait for color sampling and base rendering
  const portraitColorRef = useRef<Uint8ClampedArray | null>(null);
  const portraitImgRef = useRef<HTMLImageElement | null>(null);

  // Image cache: photoUrl → HTMLImageElement
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Current display cells: displayIdx → { photoUrl, cells }
  const displayCellsRef = useRef<Map<number, { photoUrl: string; cells: number }>>(new Map());

  // Sample portrait colors into a flat RGBA array at DISPLAY_GRID resolution
  const samplePortraitColors = useCallback(() => {
    const offscreen = document.createElement("canvas");
    offscreen.width = DISPLAY_GRID;
    offscreen.height = DISPLAY_GRID;
    const ctx = offscreen.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, DISPLAY_GRID, DISPLAY_GRID);
      portraitColorRef.current = ctx.getImageData(0, 0, DISPLAY_GRID, DISPLAY_GRID).data;
      portraitImgRef.current = img;
      draw();
    };
    img.src = "/trump-portrait.svg";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function realIndexToDisplayIndex(realIdx: number): number {
    return Math.min(Math.floor((realIdx / 1_000_000) * TOTAL_DISPLAY), TOTAL_DISPLAY - 1);
  }

  function loadPhoto(url: string, onLoad: () => void): HTMLImageElement | null {
    const cache = imgCacheRef.current;
    if (cache.has(url)) return cache.get(url)!;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { cache.set(url, img); onLoad(); };
    img.onerror = () => cache.set(url, img); // store even on error to avoid retry loops
    img.src = url;
    cache.set(url, img); // store placeholder so we don't re-request
    return null;
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cw = W / DISPLAY_GRID;
    const ch = H / DISPLAY_GRID;
    const colors = portraitColorRef.current;
    const cells = displayCellsRef.current;

    ctx.clearRect(0, 0, W, H);

    // Draw portrait as the base layer — always visible underneath the grid
    const portraitImg = portraitImgRef.current;
    if (portraitImg) {
      ctx.drawImage(portraitImg, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, W, H);
    }

    for (let r = 0; r < DISPLAY_GRID; r++) {
      for (let c = 0; c < DISPLAY_GRID; c++) {
        const dIdx = r * DISPLAY_GRID + c;
        const x = c * cw;
        const y = r * ch;

        // Portrait reference color for multiply-blending supporter photos
        let pr = 20, pg = 20, pb = 20;
        if (colors) {
          const pi = dIdx * 4;
          pr = colors[pi]; pg = colors[pi + 1]; pb = colors[pi + 2];
        }

        const cellData = cells.get(dIdx);

        if (cellData?.photoUrl) {
          const img = loadPhoto(cellData.photoUrl, draw);
          if (img?.complete && img.naturalWidth > 0) {
            // Draw supporter photo, then multiply-blend portrait color so zoomed-out
            // the cells collectively read as the Trump portrait
            ctx.drawImage(img, x, y, cw, ch);
            ctx.globalCompositeOperation = "multiply";
            ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
            ctx.fillRect(x, y, cw, ch);
            ctx.globalCompositeOperation = "source-over";
          } else {
            // Photo still loading — portrait base already shows; slight dim while waiting
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.fillRect(x, y, cw, ch);
          }
        } else {
          // Empty cell — dark overlay lets portrait show at ~35% brightness
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.fillRect(x, y, cw, ch);
        }

        // Subtle grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 0.3;
        ctx.strokeRect(x, y, cw, ch);
      }
    }
  }

  // Flash a newly added cell in gold
  function flashCell(displayIdx: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cw = W / DISPLAY_GRID;
    const ch = H / DISPLAY_GRID;
    const r = Math.floor(displayIdx / DISPLAY_GRID);
    const c = displayIdx % DISPLAY_GRID;

    let alpha = 0.85;
    const fade = () => {
      if (alpha <= 0) { draw(); return; }
      ctx.fillStyle = `rgba(201, 168, 76, ${alpha})`;
      ctx.fillRect(c * cw, r * ch, cw, ch);
      alpha -= 0.06;
      requestAnimationFrame(fade);
    };
    requestAnimationFrame(fade);
  }

  // Seed display cells from initial props
  useEffect(() => {
    const cells = displayCellsRef.current;
    filledCells.forEach((cell) => {
      if (!cell.photoUrl) return;
      const dIdx = realIndexToDisplayIndex(cell.index);
      if (!cells.has(dIdx)) {
        cells.set(dIdx, { photoUrl: cell.photoUrl, cells: cell.cells });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize portrait colors and first draw
  useEffect(() => {
    samplePortraitColors();
  }, [samplePortraitColors]);

  // Supabase Realtime — listen for new uploads
  useEffect(() => {
    const channel = supabase
      .channel("mosaic-preview-updates")
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "purchases",
          filter: "photo_uploaded=eq.true",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new;
          if (!row?.photo_uploaded || !row?.photo_url) return;

          const indices: number[] = row.cell_indices ?? [];
          const cells = displayCellsRef.current;
          let firstNewDisplay = -1;

          indices.forEach((realIdx: number) => {
            const dIdx = realIndexToDisplayIndex(realIdx);
            if (!cells.has(dIdx)) {
              cells.set(dIdx, { photoUrl: row.photo_url, cells: row.cells_purchased });
              if (firstNewDisplay === -1) firstNewDisplay = dIdx;
            }
          });

          if (firstNewDisplay !== -1) flashCell(firstNewDisplay);

          const newCell: Cell = {
            index: indices[0] ?? 0,
            photoUrl: row.photo_url,
            cells: row.cells_purchased,
          };
          onNewCell?.(newCell, totalFilled + row.cells_purchased);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [totalFilled, onNewCell]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mosaic-wrapper rounded-lg overflow-hidden" style={{ aspectRatio: "500/580", position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={500}
        height={580}
        className="mosaic-canvas w-full h-full"
        title="Zoom in to see individual supporters"
      />
      <div
        className="absolute bottom-0 left-0 right-0 px-3 py-2 text-center text-xs"
        style={{
          background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
          color: "#c9a84c",
          pointerEvents: "none",
        }}
      >
        {totalFilled.toLocaleString()} / 1,000,000 supporters
      </div>
    </div>
  );
}
