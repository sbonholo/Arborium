"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Cell {
  index: number;
  photoUrl: string;
  cells: number;
}

export interface MosaicViewerProps {
  highlightCell?: number | null;
  onTotalFilled?: (n: number) => void;
}

const GRID = 1000;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3000;

// ── Photo-loading tiers (by cellPx = canvas pixels rendered per cell) ──
const CELL_PX_THUMB = 8;   // below → no photos; above → load thumbnails
const CELL_PX_FULL  = 20;  // above → load full-quality images
const MAX_CACHE      = 2000;
const MAX_CONCURRENT = 10;
const LOAD_BUFFER    = 2;   // cells beyond visible edge to preload

function coverCrop(img: HTMLImageElement, targetW: number, targetH: number) {
  const ir = img.naturalWidth / img.naturalHeight;
  const tr = targetW / targetH;
  if (ir > tr) {
    const sh = img.naturalHeight;
    const sw = sh * tr;
    return { sx: (img.naturalWidth - sw) / 2, sy: 0, sw, sh };
  }
  const sw = img.naturalWidth;
  const sh = sw / tr;
  return { sx: 0, sy: 0, sw, sh };
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Supabase Storage image transform — falls back to original URL for non-Supabase hosts
function toTransformUrl(url: string, width: number): string {
  if (!url.includes(".supabase.co/storage/v1/object/public/")) return url;
  return (
    url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
    `?width=${width}&quality=75`
  );
}

function tierUrl(photoUrl: string, tier: number): string {
  if (tier === 1) return toTransformUrl(photoUrl, 20);
  if (tier === 2) return toTransformUrl(photoUrl, 120);
  return photoUrl;
}

function getCellTier(cellPx: number): number {
  if (cellPx < CELL_PX_THUMB) return 0;
  if (cellPx < CELL_PX_FULL)  return 1;
  return 2;
}

type RevealPhase = "none" | "zooming-in" | "zoomed-in" | "zooming-out" | "settled";

export default function MosaicViewer({ highlightCell = null, onTotalFilled }: MosaicViewerProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewRef        = useRef({ x: 0, y: 0, zoom: 1 });
  const initialViewRef = useRef({ x: 0, y: 0, zoom: 1 });

  const cellsRef         = useRef<Map<number, Cell>>(new Map());
  const portraitRef      = useRef<HTMLImageElement | null>(null);
  const portraitColorsRef = useRef<Uint8ClampedArray | null>(null);

  // LRU cache: Map insertion order tracks recency (oldest entry = front).
  // Touching an entry = delete + re-insert so it moves to the back.
  const imgCacheRef   = useRef<Map<string, HTMLImageElement | "loading" | "error">>(new Map());
  const activeLoadsRef = useRef<Set<string>>(new Set());

  const dragRef  = useRef({ active: false, startX: 0, startY: 0, startCamX: 0, startCamY: 0 });
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 });

  const animRef      = useRef<number>(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightCellRef = useRef<number | null>(highlightCell);

  const [totalFilled, setTotalFilled] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(false);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>(
    highlightCell !== null ? "zooming-in" : "none"
  );

  useEffect(() => {
    if (totalFilled > 0) onTotalFilled?.(totalFilled);
  }, [totalFilled, onTotalFilled]);

  // ── LRU helpers ───────────────────────────────────────────────

  function touchCache(url: string): HTMLImageElement | "loading" | "error" | undefined {
    const cache = imgCacheRef.current;
    const v = cache.get(url);
    if (v !== undefined && v !== "loading") {
      // Move to end = mark as recently used
      cache.delete(url);
      cache.set(url, v);
    }
    return v;
  }

  function evictCache() {
    const cache = imgCacheRef.current;
    if (cache.size <= MAX_CACHE) return;
    const toEvict = cache.size - MAX_CACHE;
    let n = 0;
    for (const [key, val] of cache) {
      if (n >= toEvict) break;
      if (val !== "loading") {
        if (val instanceof HTMLImageElement) val.src = ""; // hint GC
        cache.delete(key);
        n++;
      }
    }
  }

  // ── Single image loader (called by the priority dispatcher) ──

  function startLoad(url: string) {
    const cache  = imgCacheRef.current;
    const active = activeLoadsRef.current;
    if (active.has(url) || cache.has(url)) return;
    active.add(url);
    cache.set(url, "loading");
    const img = new Image();
    img.onload = () => {
      cache.delete(url);     // re-insert at end for LRU
      cache.set(url, img);
      active.delete(url);
      evictCache();
      render();
    };
    img.onerror = () => {
      cache.set(url, "error");
      active.delete(url);
    };
    img.src = url;
  }

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

    if (cellPx < 1) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const tier   = getCellTier(cellPx);
    const colors = portraitColorsRef.current;

    const colStart = Math.max(0, Math.floor(camX) - 1);
    const rowStart = Math.max(0, Math.floor(camY) - 1);
    const colEnd   = Math.min(GRID, Math.ceil(camX + W / cellPx) + 1);
    const rowEnd   = Math.min(GRID, Math.ceil(camY + H / cellPx) + 1);

    const viewCenterCol = camX + (W / 2) / cellPx;
    const viewCenterRow = camY + (H / 2) / cellPx;

    // Accumulate pending loads for this frame — keyed by URL, value = best (lowest) priority seen
    const pending = new Map<string, number>();

    for (let row = rowStart; row < rowEnd; row++) {
      for (let col = colStart; col < colEnd; col++) {
        const realIdx = row * GRID + col;
        const sx = (col - camX) * cellPx;
        const sy = (row - camY) * cellPx;

        let pr = 20, pg = 20, pb = 20;
        if (colors) {
          const sCol = Math.floor(col / 10);
          const sRow = Math.floor(row / 10);
          const pi   = (sRow * 100 + sCol) * 4;
          pr = colors[pi]; pg = colors[pi + 1]; pb = colors[pi + 2];
        }

        const cell         = cellsRef.current.get(realIdx);
        const isHighlighted = highlightCellRef.current === realIdx;
        const tintAlpha    = Math.max(0, Math.min(1, 1 - (cellPx - 30) / 70));

        if (cell && tier > 0) {
          // ── Tier-aware photo rendering ──
          const fUrl = tierUrl(cell.photoUrl, tier);
          const tUrl = tier === 2 ? tierUrl(cell.photoUrl, 1) : null; // thumb fallback

          const fEntry = touchCache(fUrl);
          const tEntry = tUrl ? touchCache(tUrl) : undefined;

          const img =
            (fEntry instanceof HTMLImageElement ? fEntry : null) ??
            (tEntry instanceof HTMLImageElement ? tEntry : null);

          if (img) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, sx, sy, cellPx, cellPx);
            if (!isHighlighted && tintAlpha > 0.02) {
              ctx.globalCompositeOperation = "multiply";
              ctx.globalAlpha = tintAlpha;
              ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
              ctx.fillRect(sx, sy, cellPx, cellPx);
              ctx.globalAlpha = 1;
              ctx.globalCompositeOperation = "source-over";
            }
          } else {
            ctx.fillStyle = `rgb(${pr}, ${pg}, ${pb})`;
            ctx.fillRect(sx, sy, cellPx, cellPx);
          }

          // Collect loads needed (skip already-cached or errored)
          const active = activeLoadsRef.current;
          const cache  = imgCacheRef.current;
          const dist   = Math.abs(col - viewCenterCol) + Math.abs(row - viewCenterRow);

          if (!cache.has(fUrl) && !active.has(fUrl)) {
            const prev = pending.get(fUrl);
            if (prev === undefined || dist < prev) pending.set(fUrl, dist);
          }
          if (tUrl && !cache.has(tUrl) && !active.has(tUrl)) {
            const prev = pending.get(tUrl);
            // Thumb gets slightly lower priority than full at same position
            if (prev === undefined || dist + 0.5 < prev) pending.set(tUrl, dist + 0.5);
          }
        } else {
          // Tier 0 or empty cell — solid colour placeholder only
          ctx.fillStyle = cell ? `rgb(${pr}, ${pg}, ${pb})` : "rgba(0,0,0,0.55)";
          ctx.fillRect(sx, sy, cellPx, cellPx);
        }

        if (cellPx >= 6) {
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.lineWidth   = 0.5;
          ctx.strokeRect(sx, sy, cellPx, cellPx);
        }

        if (isHighlighted && cellPx >= 1.5) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 380);
          ctx.save();
          ctx.shadowColor = "#c9a84c";
          ctx.shadowBlur  = 16 + pulse * 12;
          ctx.strokeStyle = `rgba(201, 168, 76, ${0.75 + pulse * 0.25})`;
          ctx.lineWidth   = Math.min(5, Math.max(2, cellPx * 0.03));
          ctx.strokeRect(sx, sy, cellPx, cellPx);
          ctx.restore();
        }
      }
    }

    // ── Buffer zone: enqueue loads for cells just outside the visible area ──
    if (tier > 0) {
      const bufCS  = Math.max(0, colStart - LOAD_BUFFER);
      const bufRS  = Math.max(0, rowStart - LOAD_BUFFER);
      const bufCE  = Math.min(GRID, colEnd + LOAD_BUFFER);
      const bufRE  = Math.min(GRID, rowEnd + LOAD_BUFFER);
      const active = activeLoadsRef.current;
      const cache  = imgCacheRef.current;

      for (let row = bufRS; row < bufRE; row++) {
        for (let col = bufCS; col < bufCE; col++) {
          if (row >= rowStart && row < rowEnd && col >= colStart && col < colEnd) continue;
          const cell = cellsRef.current.get(row * GRID + col);
          if (!cell) continue;
          const url  = tierUrl(cell.photoUrl, tier);
          if (cache.has(url) || active.has(url)) continue;
          const dist = Math.abs(col - viewCenterCol) + Math.abs(row - viewCenterRow);
          const prev = pending.get(url);
          if (prev === undefined || dist < prev) pending.set(url, dist);
        }
      }
    }

    // ── Priority dispatch: sort by distance-to-centre, start up to MAX_CONCURRENT ──
    if (pending.size > 0) {
      const active  = activeLoadsRef.current;
      const sorted  = [...pending.entries()].sort((a, b) => a[1] - b[1]);
      for (const [url] of sorted) {
        if (active.size >= MAX_CONCURRENT) break;
        startLoad(url);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── View animation helpers ────────────────────────────────────

  function animateView(
    from: { x: number; y: number; zoom: number },
    to:   { x: number; y: number; zoom: number },
    durationMs: number,
    onComplete?: () => void
  ) {
    cancelAnimationFrame(animRef.current);
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const e = easeInOutCubic(t);
      viewRef.current = {
        x:    from.x    + (to.x    - from.x)    * e,
        y:    from.y    + (to.y    - from.y)    * e,
        zoom: from.zoom + (to.zoom - from.zoom) * e,
      };
      render();
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else onComplete?.();
    };
    animRef.current = requestAnimationFrame(step);
  }

  function cellCenteredView(cellIndex: number) {
    const W   = canvasRef.current?.width  ?? 800;
    const H   = canvasRef.current?.height ?? 600;
    const col = cellIndex % GRID;
    const row = Math.floor(cellIndex / GRID);
    const targetPx = Math.min(W * 0.8, H * 0.45);
    const zoom     = Math.min(MAX_ZOOM, (targetPx * GRID) / W);
    const cellPx   = (W / GRID) * zoom;
    return {
      x:    (col + 0.5) - (W / 2) / cellPx,
      y:    (row + 0.5) - (H / 2) / cellPx,
      zoom,
    };
  }

  function fitToWindow() {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    const computed =
      W > H
        ? { zoom: H / W, x: -(GRID * (W / H - 1)) / 2, y: 0 }
        : { zoom: 1,     x: 0, y: -(GRID * (H / W - 1)) / 2 };
    viewRef.current        = computed;
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
        const fromView = { ...viewRef.current };
        const toView   = cellCenteredView(highlightCellRef.current);
        animateView(fromView, toView, 2000, () => {
          setRevealPhase("zoomed-in");
          holdTimerRef.current = setTimeout(() => {
            const zoomedView = { ...viewRef.current };
            const fullView   = { ...initialViewRef.current };
            setRevealPhase("zooming-out");
            animateView(zoomedView, fullView, 2500, () => setRevealPhase("settled"));
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
    const loop = () => { if (!active) return; render(); animRef.current = requestAnimationFrame(loop); };
    animRef.current = requestAnimationFrame(loop);
    return () => { active = false; cancelAnimationFrame(animRef.current); };
  }, [revealPhase, render]);

  // ── Cleanup on unmount ────────────────────────────────────────

  useEffect(() => () => {
    cancelAnimationFrame(animRef.current);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  // ── Resize ────────────────────────────────────────────────────

  useEffect(() => {
    fitToWindow();
    const onResize = () => { fitToWindow(); render(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cell data loading (metadata only — no images fetched here) ──

  useEffect(() => {
    async function loadAll() {
      let after = 0, total = 0;
      while (true) {
        const res = await fetch(`/api/mosaic?after=${after}`);
        if (!res.ok) { setLoadError(true); break; }
        const { cells, nextAfter } = await res.json();
        (cells as Cell[]).forEach((c) => { cellsRef.current.set(c.index, c); total++; });
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
    const rect     = canvas.getBoundingClientRect();
    const mouseX   = e.clientX - rect.left;
    const mouseY   = e.clientY - rect.top;
    const view     = viewRef.current;
    const oldZoom  = view.zoom;
    const newZoom  = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * (e.deltaY < 0 ? 1.2 : 0.83)));
    const cellPx   = (canvas.width / GRID) * oldZoom;
    const worldX   = view.x + mouseX / cellPx;
    const worldY   = view.y + mouseY / cellPx;
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
          const rect    = canvas.getBoundingClientRect();
          const canvasX = (e.clientX - rect.left) * (canvas.width  / rect.width);
          const canvasY = (e.clientY - rect.top)  * (canvas.height / rect.height);
          const { x: camX, y: camY, zoom } = viewRef.current;
          const cellPx  = (canvas.width / GRID) * zoom;
          const col     = Math.floor(camX + canvasX / cellPx);
          const row     = Math.floor(camY + canvasY / cellPx);
          if (col >= 0 && col < GRID && row >= 0 && row < GRID) {
            const idx = row * GRID + col;
            if (cellsRef.current.has(idx)) animateView({ ...viewRef.current }, cellCenteredView(idx), 600);
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
    const drag       = dragRef.current;
    const wasPinching = pinchRef.current.active;
    dragRef.current.active  = false;
    pinchRef.current.active = false;
    if (!wasPinching && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const dx    = touch.clientX - drag.startX;
      const dy    = touch.clientY - drag.startY;
      if (Math.hypot(dx, dy) < 10) {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect    = canvas.getBoundingClientRect();
          const canvasX = (touch.clientX - rect.left) * (canvas.width  / rect.width);
          const canvasY = (touch.clientY - rect.top)  * (canvas.height / rect.height);
          const { x: camX, y: camY, zoom } = viewRef.current;
          const cellPx  = (canvas.width / GRID) * zoom;
          const col     = Math.floor(camX + canvasX / cellPx);
          const row     = Math.floor(camY + canvasY / cellPx);
          if (col >= 0 && col < GRID && row >= 0 && row < GRID) {
            const idx = row * GRID + col;
            if (cellsRef.current.has(idx)) animateView({ ...viewRef.current }, cellCenteredView(idx), 600);
          }
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        @keyframes badgePop {
          from { opacity: 0; transform: translateX(-50%) scale(0.85); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes toastSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        ref={containerRef}
        className="w-full h-full relative"
        style={{ cursor: "crosshair", background: "#0d0d0d" }}
      >
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

        {revealPhase === "zoomed-in" && highlightCell !== null && (
          <div
            style={{
              position: "absolute", bottom: 160, left: "50%",
              animation: "badgePop 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
              pointerEvents: "none", zIndex: 20,
            }}
          >
            <div style={{ transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                background: "rgba(201,168,76,0.96)", color: "#0d0d0d",
                fontWeight: 700, fontSize: "0.95rem", padding: "9px 20px",
                borderRadius: 24, whiteSpace: "nowrap",
                boxShadow: "0 4px 24px rgba(201,168,76,0.45), 0 2px 8px rgba(0,0,0,0.5)",
              }}>
                ✦ Your photo is right here!
              </div>
              <div style={{ width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderTop: "11px solid rgba(201,168,76,0.96)" }} />
            </div>
          </div>
        )}

        {revealPhase === "settled" && highlightCell !== null && (
          <div style={{ position: "absolute", bottom: 160, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>
            <div style={{ animation: "toastSlideUp 0.5s ease both" }}>
              <div style={{
                background: "rgba(7,5,1,0.97)", border: "1px solid rgba(201,168,76,0.45)",
                borderRadius: 14, padding: "11px 22px", textAlign: "center",
                maxWidth: "min(360px, 90vw)", boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
              }}>
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

        <div
          className="absolute left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full"
          style={{ bottom: 8, background: "rgba(0,0,0,0.7)", color: "#c9a84c", pointerEvents: "none", zIndex: 5 }}
        >
          Tap any photo to zoom in · Scroll/pinch · Drag to pan
        </div>

        {loading && (
          <div className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full"
            style={{ background: "rgba(0,0,0,0.7)", color: "#c9a84c", zIndex: 5 }}>
            Loading cells…
          </div>
        )}
        {loadError && (
          <div className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full"
            style={{ background: "rgba(180,30,30,0.85)", color: "#fff", zIndex: 5 }}>
            Some cells failed to load
          </div>
        )}
      </div>
    </>
  );
}
