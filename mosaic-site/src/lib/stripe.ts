import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

export const PRICE_PER_CELL_CENTS = 200; // $2.00

export function cellsToAmountCents(cells: number): number {
  return cells * PRICE_PER_CELL_CENTS;
}
