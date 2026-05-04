import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, unknown> = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/https?:\/\//, "").split(".")[0].slice(0, 8) + "…"
      : "MISSING",
    serviceKeyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 12) + "…"
      : "MISSING",
    stripeKeyPrefix: process.env.STRIPE_SECRET_KEY
      ? process.env.STRIPE_SECRET_KEY.slice(0, 12) + "…"
      : "MISSING",
    webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "MISSING",
  };

  // Test Supabase admin connectivity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbError } = await (supabaseAdmin as any)
    .from("purchases")
    .select("id")
    .limit(1);

  checks.supabaseAdminReachable = !dbError;
  if (dbError) {
    checks.supabaseAdminError = { message: dbError.message, code: dbError.code, hint: dbError.hint };
  }

  // Test anon connectivity (what the mosaic viewer uses)
  const { createClient } = await import("@supabase/supabase-js");
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: anonError } = await (anonClient as any)
    .from("purchases")
    .select("id")
    .limit(1);

  checks.supabaseAnonReachable = !anonError;
  if (anonError) {
    checks.supabaseAnonError = { message: anonError.message, code: anonError.code };
  }

  const allOk = checks.supabaseAdminReachable === true && checks.supabaseAnonReachable === true;
  return Response.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
