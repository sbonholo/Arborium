"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface Cell {
  index: number;
  photoUrl: string;
  cells: number;
}

const GRID = 1000;
const TOTAL_CELLS = GRID * GRID;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3000;

function coverCrop(img: HTMLImageElement, targetW: number, targetH: number) {
  const ir = img.naturalWidth / img.naturalHeight;
  const tr = targetW / targetH;
  if (ir > tr) {
    const sh = img.naturalHeight;
    const sw = sh * tr;
    return { sx: (img.naturalWidth - sw) / 2, sy: 0, sw, sh };
  } else {
    const sw = img.naturalWidth;
    const sh = sw / tr;
    return { sx: 0, sy: 0, sw, sh };
  }
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type RevealPhase = "none" | "zooming-in" | "zoomed-in" | "zooming-out" | "settled";

export default function MosaicViewerClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera: position in grid-cell units + zoom multiplier
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 });
  // Snapshot of the full-portrait view, used as zoom-out target
  const initialViewRef = useRef({ x: 0, y: 0, zoom: 1 });

  const cellsRef = useRef<Map<number, Cell>>(new Map());
  const portraitRef = useRef<HTMLImageElement | null>(null);
  const portraitColorsRef = useRef<Uint8ClampedArray | null>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement | "loading" | "error">>(new Map());

  const dragRef = useRef({ active: false, startX: 0, startY: 0, startCamX: 0, startCamY: 0 });
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 });

  // rAF and timer handles for the reveal sequence
  const animRef = useRef<number>(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ?cell= query param — the cell to highlight and reveal
  const searchParams = useSearchParams();
  const highlightCellParam = searchParams.get("cell");
  const highlightCell = highlightCellParam !== null ? parseInt(highlightCellParam, 10) : null;
  const highlightCellRef = useRef<number | null>(highlightCell);

  const [totalFilled, setTotalFilled] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>(
    highlightCell !== null ? "zooming-in" : "none"
  );

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

    const cellPx = (W / GRID) * zoom;

    // Portrait as base layer
    const portrait = portraitRef.current;
    if (portrait) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const { sx, sy, sw, sh } = coverCrop(portrait, GRID, GRID);
      ctx.drawImage(
        portrait, sx, sy, sw, sh,
        -camX * cellPx, -camY * cellPx, GRID * cellPx, GRID * cellPx
      );
    }
    const colors = portraitColorsRef.current;

    // When cells are sub-pixel, per-cell fillRects stack to solid black and bury
    // the portrait. Instead, show the portrait clearly with a single light tint.
    if (cellPx < 1) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const colStart = Math.max(0, Math.floor(camX) - 1);
    const rowStart = Math.max(0, Math.floor(camY) - 1);
    const colEnd = Math.min(GRID, Math.ceil(camX + W / cellPx) + 1);
    const rowEnd = Math.min(GRID, Math.ceil(camY + H / cellPx) + 1);

    for (let row = rowStart; row < rowEnd; row++) {
      for (let col = colStart; col < colEnd; col++) {
        const realIdx = row * GRID + col;
        const sx = (col - camX) * cellPx;
        const sy = (row - camY) * cellPx;

        let pr = 20, pg = 20, pb = 20;
        if (colors) {
          const sampleCol = Math.floor(col / 10);
          const sampleRow = Math.floor(row / 10);
          const pi = (sampleRow * 100 + sampleCol) * 4;
          pr = colors[pi]; pg = colors[pi + 1]; pb = colors[pi + 2];
        }

        const cell = cellsRef.current.get(realIdx);
        const isHighlighted = highlightCellRef.current === realIdx;
        // As we zoom in, fade the portrait colour tint so individual faces reveal in natural colour.
        // Full tint at cellPx ≤ 30, gone by cellPx ≥ 100.
        const tintAlpha = Math.max(0, Math.min(1, 1 - (cellPx - 30) / 70));

        if (cell) {
          if (cellPx >= 3) {
            drawCellPhoto(ctx, cell.photoUrl, sx, sy, cellPx, cellPx, pr, pg, pb, isHighlighted, tintAlpha);
          } else {
            ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
            ctx.fillRect(sx, sy, cellPx, cellPx);
          }
        } else {
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(sx, sy, cellPx, cellPx);
        }

        if (cellPx >= 6) {
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx, sy, cellPx, cellPx);
        }

        // Pulsing gold glow on the user's highlighted cell.
        // Cap blur and lineWidth so they stay reasonable at any zoom level.
        if (isHighlighted && cellPx >= 1.5) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 380);
          ctx.save();
          ctx.shadowColor = "#c9a84c";
          ctx.shadowBlur = 16 + pulse * 12;          // always 16–28 px regardless of zoom
          ctx.strokeStyle = `rgba(201, 168, 76, ${0.75 + pulse * 0.25})`;
          ctx.lineWidth = Math.min(5, Math.max(2, cellPx * 0.03));
          ctx.strokeRect(sx, sy, cellPx, cellPx);
          ctx.restore();
        }
      }
    }
  }, []);

  function drawCellPhoto(
    ctx: CanvasRenderingContext2D,
    url: string,
    x: number, y: number, w: number, h: number,
    pr: number, pg: number, pb: number,
    skipTint = false,
    tintAlpha = 1
  ) {
    const cache = imgCacheRef.current;
    const entry = cache.get(url);

    if (entry === "loading" || entry === "error") {
      ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
      ctx.fillRect(x, y, w, h);
      return;
    }

    if (entry instanceof HTMLImageElement && entry.complete && entry.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(entry, x, y, w, h);
      if (!skipTint && tintAlpha > 0.02) {
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = tintAlpha;
        ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      return;
    }

    ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
    ctx.fillRect(x, y, w, h);

    if (!entry) {
      cache.set(url, "loading");
      const img = new Image();
      img.onload = () => { cache.set(url, img); render(); };
      img.onerror = () => cache.set(url, "error");
      img.src = url;
    }
  }

  // ── View animation helpers ────────────────────────────────────

  function animateView(
    from: { x: number; y: number; zoom: number },
    to: { x: number; y: number; zoom: number },
    durationMs: number,
    onComplete?: () => void
  ) {
    cancelAnimationFrame(animRef.current);
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const e = easeInOutCubic(t);
      viewRef.current = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        zoom: from.zoom + (to.zoom - from.zoom) * e,
      };
      render();
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else onComplete?.();
    };
    animRef.current = requestAnimationFrame(step);
  }

  function cellCenteredView(cellIndex: number) {
    const W = canvasRef.current?.width ?? 800;
    const H = canvasRef.current?.height ?? 600;
    const col = cellIndex % GRID;
    const row = Math.floor(cellIndex / GRID);
    // Target: cell fills ~80 % of the shorter canvas dimension (~half the phone screen).
    // Use the smaller of 80 % width and 45 % height so the face is large but still centred.
    const targetPx = Math.min(W * 0.8, H * 0.45);
    const zoom = Math.min(MAX_ZOOM, (targetPx * GRID) / W);
    const cellPx = (W / GRID) * zoom;
    return {
      x: (col + 0.5) - (W / 2) / cellPx,
      y: (row + 0.5) - (H / 2) / cellPx,
      zoom,
    };
  }

  // ── Fit canvas + store initial full-portrait view ─────────────

  function fitToWindow() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) return;

    // zoom semantics: cellPx = (W / GRID) * zoom
    // zoom = 1  → portrait fills canvas width  (W pixels wide)
    // zoom = H/W → portrait fills canvas height (H pixels wide = H pixels tall since square)
    //
    // Portrait screen (W ≤ H): fit to width, center vertically
    // Landscape screen  (W > H): fit to height, center horizontally
    const computed =
      W > H
        ? { zoom: H / W, x: -(GRID * (W / H - 1)) / 2, y: 0 }
        : { zoom: 1,     x: 0, y: -(GRID * (H / W - 1)) / 2 };

    viewRef.current = computed;
    initialViewRef.current = computed;
  }

  // ── Portrait load + reveal sequence trigger ───────────────────

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      portraitRef.current = img;
      const offscreen = document.createElement("canvas");
      offscreen.width = 100; offscreen.height = 100;
      const ctx2 = offscreen.getContext("2d")!;
      const { sx, sy, sw, sh } = coverCrop(img, 100, 100);
      ctx2.drawImage(img, sx, sy, sw, sh, 0, 0, 100, 100);
      portraitColorsRef.current = ctx2.getImageData(0, 0, 100, 100).data;
      fitToWindow();

      if (highlightCellRef.current !== null) {
        // Phase A: animate zoom-in to the user's cell (2 s)
        const fromView = { ...viewRef.current };
        const toView = cellCenteredView(highlightCellRef.current);
        animateView(fromView, toView, 2000, () => {
          // Phase B: hold — pulsing glow + "Your photo!" badge (2.5 s)
          setRevealPhase("zoomed-in");
          holdTimerRef.current = setTimeout(() => {
            // Phase C: animate zoom-out back to full portrait (2.5 s)
            const zoomedView = { ...viewRef.current };
            const fullView = { ...initialViewRef.current };
            setRevealPhase("zooming-out");
            animateView(zoomedView, fullView, 2500, () => {
              // Phase D: settled — persistent toast, glow persists on zoom-in
              setRevealPhase("settled");
            });
          }, 2500);
        });
      } else {
        render();
      }
    };
    img.onerror = () => { img.src = "/trump-portrait.svg"; };
    img.src = "/trump-portrait.jpg";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Continuous rAF loop during the hold phase (pulsing glow) ─

  useEffect(() => {
    if (revealPhase !== "zoomed-in") return;
    let active = true;
    const loop = () => {
      if (!active) return;
      render();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; cancelAnimationFrame(animRef.current); };
  }, [revealPhase, render]);

  // ── Cleanup on unmount ────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // ── Resize ────────────────────────────────────────────────────

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

  // ── Scroll to zoom ────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const view = viewRef.current;
    const oldZoom = view.zoom;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * (e.deltaY < 0 ? 1.2 : 0.83)));
    const cellPx = (canvas.width / GRID) * oldZoom;
    const worldX = view.x + mouseX / cellPx;
    const worldY = view.y + mouseY / cellPx;
    const newCellPx = (canvas.width / GRID) * newZoom;
    viewRef.current = { x: worldX - mouseX / newCellPx, y: worldY - mouseY / newCellPx, zoom: newZoom };
    render();
  }, [render]);

  // ── Click-drag to pan ─────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startCamX: viewRef.current.x, startCamY: viewRef.current.y };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cellPx = (canvas.width / GRID) * viewRef.current.zoom;
    viewRef.current = {
      ...viewRef.current,
      x: dragRef.current.startCamX - (e.clientX - dragRef.current.startX) / cellPx,
      y: dragRef.current.startCamY - (e.clientY - dragRef.current.startY) / cellPx,
    };
    render();
  }, [render]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.active) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.hypot(dx, dy) < 5) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const canvasX = (e.clientX - rect.left) * scaleX;
          const canvasY = (e.clientY - rect.top) * scaleY;
          const { x: camX, y: camY, zoom } = viewRef.current;
          const cellPx = (canvas.width / GRID) * zoom;
          const col = Math.floor(camX + canvasX / cellPx);
          const row = Math.floor(camY + canvasY / cellPx);
          if (col >= 0 && col < GRID && row >= 0 && row < GRID) {
            const idx = row * GRID + col;
            if (cellsRef.current.has(idx)) {
              animateView({ ...viewRef.current }, cellCenteredView(idx), 600);
            }
          }
        }
      }
    }
    dragRef.current.active = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onMouseLeave = useCallback(() => { dragRef.current.active = false; }, []);

  // ── Touch pinch-zoom + drag ───────────────────────────────────

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

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const drag = dragRef.current;
    const wasPinching = pinchRef.current.active;
    dragRef.current.active = false;
    pinchRef.current.active = false;

    if (!wasPinching && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - drag.startX;
      const dy = touch.clientY - drag.startY;
      if (Math.hypot(dx, dy) < 10) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const canvasX = (touch.clientX - rect.left) * scaleX;
          const canvasY = (touch.clientY - rect.top) * scaleY;
          const { x: camX, y: camY, zoom } = viewRef.current;
          const cellPx = (canvas.width / GRID) * zoom;
          const col = Math.floor(camX + canvasX / cellPx);
          const row = Math.floor(camY + canvasY / cellPx);
          if (col >= 0 && col < GRID && row >= 0 && row < GRID) {
            const idx = row * GRID + col;
            if (cellsRef.current.has(idx)) {
              animateView({ ...viewRef.current }, cellCenteredView(idx), 600);
            }
          }
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = ((totalFilled / TOTAL_CELLS) * 100).toFixed(4);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#0d0d0d" }}>
      <style>{`
        @keyframes badgePop {
          from { opacity: 0; transform: translateX(-50%) scale(0.85); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes toastSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cellGlow {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "#111", borderBottom: "1px solid #1a1a1a" }}
      >
        <Link href="/" className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#c9a84c" }}>
          ← Home
        </Link>
        <div className="text-center">
          <span className="text-white text-sm font-bold">{totalFilled.toLocaleString()}</span>
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
          onMouseLeave={onMouseLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ touchAction: "none", cursor: "grab" }}
        />

        {/* ── "Your photo!" badge — visible during zoomed-in hold ── */}
        {revealPhase === "zoomed-in" && highlightCell !== null && (
          <div
            style={{
              position: "absolute",
              bottom: 64,
              left: "50%",
              animation: "badgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {/* Wrapper keeps left:50% and handles the centering separately from the animation */}
            <div style={{ transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
              <div
                style={{
                  background: "rgba(201,168,76,0.96)",
                  color: "#0d0d0d",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  padding: "9px 20px",
                  borderRadius: 24,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 24px rgba(201,168,76,0.45), 0 2px 8px rgba(0,0,0,0.5)",
                }}
              >
                ✦ Your photo is right here!
              </div>
              {/* Down-arrow pointing toward center of canvas (the cell) */}
              <div
                style={{
                  width: 0, height: 0,
                  borderLeft: "9px solid transparent",
                  borderRight: "9px solid transparent",
                  borderTop: "11px solid rgba(201,168,76,0.96)",
                }}
              />
            </div>
          </div>
        )}

        {/* ── Persistent toast — appears after zoom-out ── */}
        {revealPhase === "settled" && highlightCell !== null && (
          <div
            style={{
              position: "absolute",
              bottom: 56,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
            }}
          >
            <div style={{ animation: "toastSlideUp 0.5s ease both" }}>
              <div
                style={{
                  background: "rgba(7,5,1,0.97)",
                  border: "1px solid rgba(201,168,76,0.45)",
                  borderRadius: 14,
                  padding: "11px 22px",
                  textAlign: "center",
                  maxWidth: "min(360px, 90vw)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(201,168,76,0.1)",
                }}
              >
                <p style={{ color: "#c9a84c", fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>
                  🎉 Your photo is now in the mosaic!
                </p>
                <p style={{ color: "#505050", fontSize: "0.75rem", margin: "5px 0 0" }}>
                  Supporter #{(highlightCell + 1).toLocaleString()} of 1,000,000
                  &nbsp;·&nbsp;Zoom in to see your face
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Standard hint ── */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full"
          style={{ background: "rgba(0,0,0,0.7)", color: "#c9a84c", pointerEvents: "none" }}
        >
          Tap any photo to zoom in · Scroll/pinch · Drag to pan
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
