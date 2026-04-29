// The mosaic is a 1000×1000 grid = 1,000,000 total cells.
// Each cell is identified by its linear index: row * GRID_SIZE + col.

export const GRID_SIZE = 1000;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

export function indexToRowCol(index: number): { row: number; col: number } {
  return { row: Math.floor(index / GRID_SIZE), col: index % GRID_SIZE };
}

export function rowColToIndex(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

/**
 * Given a count of cells to allocate, returns a rectangular block shape.
 * Prefers square-ish blocks (e.g. 4 cells → 2×2, 9 → 3×3, 6 → 2×3).
 */
export function bestBlock(cells: number): { rows: number; cols: number } {
  const sqrt = Math.sqrt(cells);
  const rows = Math.floor(sqrt);
  const cols = Math.ceil(cells / rows);
  return { rows, cols };
}

/**
 * Predefined tier options the user can choose from.
 * Each tier buys a contiguous block of cells at $2 per cell.
 */
export const TIERS = [
  { id: "1",   cells: 1,   label: "Standard",   size: "1×1",   priceUsd: 2   },
  { id: "4",   cells: 4,   label: "Double",     size: "2×2",   priceUsd: 8   },
  { id: "9",   cells: 9,   label: "Large",      size: "3×3",   priceUsd: 18  },
  { id: "25",  cells: 25,  label: "XL",         size: "5×5",   priceUsd: 50  },
  { id: "100", cells: 100, label: "Premium",    size: "10×10", priceUsd: 200 },
] as const;

export type TierId = (typeof TIERS)[number]["id"];
