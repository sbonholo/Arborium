import { Suspense } from "react";
import LandingClient from "./LandingClient";
import { supabase } from "@/lib/supabase";

async function getStats() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await supabase.from("mosaic_stats").select("*").single()) as any;
    return {
      totalFilled: Number(data?.total_cells_filled ?? 0),
      totalPurchases: Number(data?.total_purchases ?? 0),
    };
  } catch {
    return { totalFilled: 0, totalPurchases: 0 };
  }
}

async function getFilledCells() {
  try {
    const { data } = await supabase
      .from("purchases")
      .select("cell_indices, cells_purchased, photo_url")
      .eq("photo_uploaded", true)
      .limit(500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).flatMap((row) =>
      ((row.cell_indices ?? []) as number[]).map((idx) => ({
        index: idx,
        photoUrl: row.photo_url as string | null,
        cells: row.cells_purchased as number,
      }))
    );
  } catch {
    return [];
  }
}

export default async function Home() {
  const [stats, filledCells] = await Promise.all([getStats(), getFilledCells()]);

  return (
    <Suspense>
      <LandingClient
        initialFilled={stats.totalFilled}
        initialPurchases={stats.totalPurchases}
        initialCells={filledCells}
      />
    </Suspense>
  );
}
