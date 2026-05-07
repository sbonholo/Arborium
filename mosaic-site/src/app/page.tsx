import { Suspense } from "react";
import LandingClient from "./LandingClient";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

async function getStats() {
  try {
    const { data } = await db.from("mosaic_stats").select("*").single();
    return {
      totalFilled: Number(data?.total_cells_filled ?? 0),
      totalPurchases: Number(data?.total_purchases ?? 0),
    };
  } catch {
    return { totalFilled: 0, totalPurchases: 0 };
  }
}

export default async function Home() {
  const stats = await getStats();

  return (
    <Suspense>
      <LandingClient
        initialFilled={stats.totalFilled}
        initialPurchases={stats.totalPurchases}
      />
    </Suspense>
  );
}
