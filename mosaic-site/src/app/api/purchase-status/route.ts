import { supabaseAdmin } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

interface PurchaseRow {
  stripe_session_id: string;
  cells_purchased: number;
  cell_indices: number[];
  photo_uploaded: boolean;
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return Response.json({ error: "Missing session_id" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = (await (supabaseAdmin as any)
    .from("purchases")
    .select("stripe_session_id, cells_purchased, cell_indices, photo_uploaded")
    .eq("stripe_session_id", sessionId)
    .maybeSingle()) as { data: PurchaseRow | null; error: { message?: string; code?: string; details?: string } | null };

  if (error) {
    console.error("[purchase-status] Supabase error:", JSON.stringify(error));
    return Response.json({ error: "Database error", detail: error.message }, { status: 500 });
  }

  if (!data) {
    return Response.json({ found: false });
  }

  return Response.json({
    found: true,
    sessionId: data.stripe_session_id,
    cells: data.cells_purchased,
    cellIndices: data.cell_indices,
    photo_uploaded: data.photo_uploaded,
  });
}
