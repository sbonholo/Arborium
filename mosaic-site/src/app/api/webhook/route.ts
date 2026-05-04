import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import Stripe from "stripe";

export const runtime = "nodejs";

// Stripe requires the raw body for signature verification.
export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature header.", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[webhook] signature verification failed:", err);
    return new Response(`Webhook signature error: ${err}`, { status: 400 });
  }

  console.log("[webhook] received event:", event.type, event.id);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      await handleSessionCompleted(session);
    } catch (err) {
      console.error("[webhook] handleSessionCompleted failed:", err);
      return new Response("Internal error.", { status: 500 });
    }
  }

  return new Response("OK", { status: 200 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

async function handleSessionCompleted(session: Stripe.Checkout.Session) {
  console.log("[webhook] processing session:", session.id, "cells:", session.metadata?.cells);

  const cells = parseInt(session.metadata?.cells ?? "1", 10);
  const amountCents = session.amount_total ?? cells * 200;

  // Idempotency — skip if already processed (Stripe can retry events)
  const { data: existing, error: lookupError } = await db
    .from("purchases")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (lookupError) {
    console.error("[webhook] idempotency lookup failed:", JSON.stringify(lookupError));
    throw new Error(`Supabase lookup error: ${lookupError.message}`);
  }

  if (existing) {
    console.log("[webhook] already processed, skipping:", session.id);
    return;
  }

  // Atomically claim the next N cells in the grid
  console.log("[webhook] calling allocate_cells RPC, n_cells:", cells);
  const { data: cellIndices, error: rpcError } = await db.rpc("allocate_cells", {
    n_cells: cells,
  });
  if (rpcError) {
    console.error("[webhook] allocate_cells RPC failed:", JSON.stringify(rpcError));
    throw new Error(`allocate_cells error: ${rpcError.message}`);
  }
  console.log("[webhook] allocated cell indices:", (cellIndices as number[]).slice(0, 3), "...");

  // Record the purchase
  const { error: insertError } = await db.from("purchases").insert({
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent as string | null,
    amount_paid_cents: amountCents,
    cells_purchased: cells,
    cell_indices: cellIndices as number[],
    photo_uploaded: false,
  });

  if (insertError) {
    console.error("[webhook] insert failed:", JSON.stringify(insertError));
    throw new Error(`Insert error: ${insertError.message}`);
  }

  console.log("[webhook] purchase recorded successfully for session:", session.id);
}
