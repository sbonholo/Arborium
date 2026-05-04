"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface Cell {
  index: number;
  photoUrl: string;
  cells: number;
}

// Real grid: 1000×1000 = 1,000,000 cells
const GRID = 1000;
const TOTAL_CELLS = GRID * GRID;

// Zoom constraints
const MIN_ZOOM = 0.5;   // fully zoomed out — whole portrait visible
const MAX_ZOOM = 20;    // fully zoomed in — individual faces clearly visible

export default function MosaicViewerClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state: what portion of the grid we're viewing
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 });

  // All filled cells
  const cellsRef = useRef<Map<number, Cell>>(new Map());

  // Portrait reference image (color sampling)
  const portraitRef = useRef<HTMLImageElement | null>(null);
  const portraitColorsRef = useRef<Uint8ClampedArray | null>(null);

  // Image cache
  const imgCacheRef = useRef<Map<string, HTMLImageElement | "loading" | "error">>(new Map());

  // Drag state
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startCamX: 0, startCamY: 0 });

  // Pinch state
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 });

  const [totalFilled, setTotalFilled] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // ── Rendering ─────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x: camX, y: camY, zoom } = viewRef.current;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, W, H);

    // Cell size in canvas pixels at current zoom
    const cellPx = (W / GRID) * zoom;

    // Draw portrait as base layer — always visible underneath cells
    const portrait = portraitRef.current;
    if (portrait) {
      const sx = portrait.naturalWidth * 0.08;
      const sw = portrait.naturalWidth * 0.84;
      const sh = portrait.naturalHeight * 0.75;
      ctx.drawImage(portrait, sx, 0, sw, sh, -camX * cellPx, -camY * cellPx, GRID * cellPx, GRID * cellPx);
    }
    const colors = portraitColorsRef.current;

    // Visible cell range (with one-cell padding)
    const colStart = Math.max(0, Math.floor(camX) - 1);
    const rowStart = Math.max(0, Math.floor(camY) - 1);
    const colEnd = Math.min(GRID, Math.ceil(camX + W / cellPx) + 1);
    const rowEnd = Math.min(GRID, Math.ceil(camY + H / cellPx) + 1);

    for (let row = rowStart; row < rowEnd; row++) {
      for (let col = colStart; col < colEnd; col++) {
        const realIdx = row * GRID + col;
        const sx = (col - camX) * cellPx;
        const sy = (row - camY) * cellPx;

        // Portrait reference color for this cell
        let pr = 20, pg = 20, pb = 20;
        if (colors) {
          // Sample from 100×100 portrait grid (map 1000-cell grid → 100-grid)
          const sampleCol = Math.floor(col / 10);
          const sampleRow = Math.floor(row / 10);
          const pi = (sampleRow * 100 + sampleCol) * 4;
          pr = colors[pi]; pg = colors[pi + 1]; pb = colors[pi + 2];
        }

        const cell = cellsRef.current.get(realIdx);

        if (cell) {
          if (cellPx >= 3) {
            // Big enough to draw an actual photo
            drawCellPhoto(ctx, cell.photoUrl, sx, sy, cellPx, cellPx, pr, pg, pb);
          } else {
            // Too small for a photo — just fill with portrait color
            ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
            ctx.fillRect(sx, sy, cellPx, cellPx);
          }
        } else {
          // Empty — dark overlay so portrait shows through at ~35% brightness
          ctx.fillStyle = "rgba(0,0,0,0.65)";
          ctx.fillRect(sx, sy, cellPx, cellPx);
        }

        // Grid lines only when cells are large enough to benefit from them
        if (cellPx >= 6) {
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx, sy, cellPx, cellPx);
        }
      }
    }
  }, []);

  function drawCellPhoto(
    ctx: CanvasRenderingContext2D,
    url: string,
    x: number, y: number, w: number, h: number,
    pr: number, pg: number, pb: number
  ) {
    const cache = imgCacheRef.current;
    const entry = cache.get(url);

    if (entry === "loading" || entry === "error") {
      ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
      ctx.fillRect(x, y, w, h);
      return;
    }

    if (entry instanceof HTMLImageElement && entry.complete && entry.naturalWidth > 0) {
      ctx.drawImage(entry, x, y, w, h);
      // Color-grade toward the portrait color using multiply blend
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
      ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    // Not cached yet — trigger load
    ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
    ctx.fillRect(x, y, w, h);

    if (!entry) {
      cache.set(url, "loading");
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { cache.set(url, img); render(); };
      img.onerror = () => cache.set(url, "error");
      img.src = url;
    }
  }

  // ── Portrait color sampling ───────────────────────────────────

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      portraitRef.current = img;
      const offscreen = document.createElement("canvas");
      offscreen.width = 100; offscreen.height = 100;
      const ctx2 = offscreen.getContext("2d")!;
      // Same crop as preview: skip 8% sides, bottom 25%
      const sx = img.naturalWidth * 0.08;
      const sw = img.naturalWidth * 0.84;
      const sh = img.naturalHeight * 0.75;
      ctx2.drawImage(img, sx, 0, sw, sh, 0, 0, 100, 100);
      portraitColorsRef.current = ctx2.getImageData(0, 0, 100, 100).data;
      fitToWindow();
      render();
    };
    img.onerror = () => { img.src = "/trump-portrait.svg"; };
    img.src = "/trump-portrait.jpg";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fit canvas to container ───────────────────────────────────

  function fitToWindow() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Fit the full portrait into view
    const portraitAspect = 500 / 580;
    const containerAspect = canvas.width / canvas.height;
    if (containerAspect > portraitAspect) {
      const zoom = canvas.height / GRID;
      viewRef.current = { x: -(canvas.width / zoom - GRID) / 2, y: 0, zoom };
    } else {
      const zoom = canvas.width / GRID;
      viewRef.current = { x: 0, y: -(canvas.height / zoom - GRID) / 2, zoom };
    }
  }

  useEffect(() => {
    fitToWindow();
    const onResize = () => { fitToWindow(); render(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ──────────────────────────────────────────────

  useEffect(() => {
    async function loadAll() {
      let after = 0;
      let total = 0;

      while (true) {
        const res = await fetch(`/api/mosaic?after=${after}`);
        if (!res.ok) { setLoadError(true); break; }
        const { cells, nextAfter } = await res.json();
        cells.forEach((c: Cell) => {
          cellsRef.current.set(c.index, c);
          total++;
        });
        setTotalFilled(total);
        render();
        if (!nextAfter) break;
        after = nextAfter;
      }
      setLoading(false);
    }
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime ──────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel("mosaic-viewer-updates")
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "purchases", filter: "photo_uploaded=eq.true" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new;
          if (!row?.photo_uploaded || !row?.photo_url) return;
          (row.cell_indices ?? []).forEach((idx: number) => {
            cellsRef.current.set(idx, { index: idx, photoUrl: row.photo_url, cells: row.cells_purchased });
          });
          setTotalFilled((t) => t + (row.cells_purchased ?? 1));
          render();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [render]);

  // ── Input: scroll to zoom ─────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const view = viewRef.current;
    const oldZoom = view.zoom;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * (e.deltaY < 0 ? 1.15 : 0.87)));
    const cellPx = (canvas.width / GRID) * oldZoom;

    // Keep the pixel under the mouse fixed while zooming
    const worldX = view.x + mouseX / cellPx;
    const worldY = view.y + mouseY / cellPx;
    const newCellPx = (canvas.width / GRID) * newZoom;
    viewRef.current = {
      x: worldX - mouseX / newCellPx,
      y: worldY - mouseY / newCellPx,
      zoom: newZoom,
    };
    render();
  }, [render]);

  // ── Input: click-drag to pan ──────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startCamX: viewRef.current.x, startCamY: viewRef.current.y };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellPx = (canvas.width / GRID) * viewRef.current.zoom;
    viewRef.current = {
      ...viewRef.current,
      x: drag.startCamX - (e.clientX - drag.startX) / cellPx,
      y: drag.startCamY - (e.clientY - drag.startY) / cellPx,
    };
    render();
  }, [render]);

  const onMouseUp = useCallback(() => { dragRef.current.active = false; }, []);

  // ── Input: touch pinch-zoom + drag ───────────────────────────

  function touchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragRef.current = { active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, startCamX: viewRef.current.x, startCamY: viewRef.current.y };
    } else if (e.touches.length === 2) {
      dragRef.current.active = false;
      pinchRef.current = { active: true, startDist: touchDist(e.touches), startZoom: viewRef.current.zoom };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (e.touches.length === 1 && dragRef.current.active) {
      const cellPx = (canvas.width / GRID) * viewRef.current.zoom;
      viewRef.current = {
        ...viewRef.current,
        x: dragRef.current.startCamX - (e.touches[0].clientX - dragRef.current.startX) / cellPx,
        y: dragRef.current.startCamY - (e.touches[0].clientY - dragRef.current.startY) / cellPx,
      };
      render();
    } else if (e.touches.length === 2 && pinchRef.current.active) {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.startZoom * (touchDist(e.touches) / pinchRef.current.startDist)));
      viewRef.current = { ...viewRef.current, zoom: newZoom };
      render();
    }
  }, [render]);

  const onTouchEnd = useCallback(() => {
    dragRef.current.active = false;
    pinchRef.current.active = false;
  }, []);

  const pct = ((totalFilled / TOTAL_CELLS) * 100).toFixed(4);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#0d0d0d" }}>
      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "#111", borderBottom: "1px solid #1a1a1a" }}
      >
        <Link href="/" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#c9a84c" }}>
          ← Home
        </Link>
        <div className="text-center">
          <span className="text-white text-sm font-bold">
            {totalFilled.toLocaleString()}
          </span>
          <span className="text-gray-600 text-xs"> / 1,000,000 · {pct}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
          <span className="text-xs text-gray-600">Live</span>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef} className="flex-1 relative" style={{ cursor: "crosshair" }}>
        <canvas
          ref={canvasRef}
          className="block w-full h-full"
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ touchAction: "none", cursor: "grab" }}
        />

        {/* Zoom hint */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full"
          style={{ background: "rgba(0,0,0,0.7)", color: "#c9a84c", pointerEvents: "none" }}
        >
          Scroll to zoom · Drag to pan
        </div>

        {loading && (
          <div
            className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full"
            style={{ background: "rgba(0,0,0,0.7)", color: "#c9a84c" }}
          >
            Loading photos…
          </div>
        )}
        {loadError && (
          <div
            className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full"
            style={{ background: "rgba(180,30,30,0.85)", color: "#fff" }}
          >
            Some photos failed to load — showing what we have
          </div>
        )}
      </div>
    </div>
  );
}
