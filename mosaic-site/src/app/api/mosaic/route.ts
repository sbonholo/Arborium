import { supabaseAdmin } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// Returns filled mosaic cells for rendering.
// Cursor-based pagination: pass ?after=<row_number> for subsequent pages.
export async function GET(request: NextRequest) {
  const limit = 5000;
  const after = parseInt(request.nextUrl.searchParams.get("after") ?? "0", 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any)
    .from("purchases")
    .select("id, cell_indices, cells_purchased, photo_url")
    .eq("photo_uploaded", true)
    .order("uploaded_at", { ascending: true })
    .range(after, after + limit - 1);

  if (error) {
    return Response.json({ error: "Database error" }, { status: 500 });
  }

  const cells = (data ?? []).flatMap((row: {
    cell_indices: number[];
    cells_purchased: number;
    photo_url: string;
  }) =>
    (row.cell_indices ?? []).map((idx: number) => ({
      index: idx,
      photoUrl: row.photo_url,
      cells: row.cells_purchased,
    }))
  );

  return Response.json({
    cells,
    nextAfter: (data ?? []).length === limit ? after + limit : null,
  });
}
