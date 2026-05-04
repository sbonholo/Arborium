import { stripe, cellsToAmountCents } from "@/lib/stripe";
import { TIERS, type TierId } from "@/lib/mosaic";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tierId: TierId = body.tierId;

    const tier = TIERS.find((t) => t.id === tierId);
    if (!tier) {
      return Response.json({ error: "Invalid tier." }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const amountCents = cellsToAmountCents(tier.cells);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Trump Mosaic — ${tier.label} spot (${tier.size})`,
              description: `${tier.cells.toLocaleString()} cell${tier.cells > 1 ? "s" : ""} in the historic portrait. Your photo will appear ${tier.cells > 1 ? `${Math.sqrt(tier.cells).toFixed(0)}× larger` : "at standard size"}.`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        tier_id: tierId,
        cells: String(tier.cells),
      },
      // After payment Stripe redirects directly to the upload page
      success_url: `${appUrl}/upload?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/`,
      // Let Stripe collect billing address for chargeback protection
      billing_address_collection: "auto",
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[checkout]", err);
    return Response.json({ error: "Could not create checkout session." }, { status: 500 });
  }
}
