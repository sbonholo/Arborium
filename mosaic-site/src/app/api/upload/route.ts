import { r2, R2_BUCKET, photoPublicUrl } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// The client resizes to 128×128 JPEG before uploading. 200 KB is a generous cap.
const MAX_PROCESSED_BYTES = 200 * 1024;

// POST /api/upload
// Headers: X-Session-ID: <id>, Content-Type: image/jpeg
// Body: raw JPEG bytes
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get("x-session-id");
    if (!sessionId) {
      return Response.json({ error: "Missing session_id." }, { status: 400 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/jpeg")) {
      return Response.json({ error: "Expected image/jpeg body." }, { status: 400 });
    }

    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return Response.json({ error: "Empty file body." }, { status: 400 });
    }
    if (arrayBuffer.byteLength > MAX_PROCESSED_BYTES) {
      return Response.json(
        { error: `File too large (max ${MAX_PROCESSED_BYTES / 1024} KB after processing).` },
        { status: 400 }
      );
    }

    // Verify purchase exists and hasn't already been uploaded
    const { data: purchase, error: lookupError } = await db
      .from("purchases")
      .select("id, photo_uploaded")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (lookupError) {
      console.error("[upload] DB lookup:", JSON.stringify(lookupError));
      return Response.json({ error: "Database error." }, { status: 500 });
    }
    if (!purchase) {
      return Response.json(
        { error: "Purchase not found. Make sure payment has completed." },
        { status: 404 }
      );
    }
    if (purchase.photo_uploaded) {
      return Response.json(
        { error: "A photo has already been uploaded for this purchase." },
        { status: 409 }
      );
    }

    // Guard: ensure R2 is configured before attempting the network call
    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
    const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
    const r2BucketName = process.env.R2_BUCKET_NAME;
    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2BucketName) {
      const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]
        .filter((k) => !process.env[k])
        .join(", ");
      console.error("[upload] Missing R2 env vars:", missing);
      return Response.json(
        { error: `R2 storage not configured. Missing: ${missing}` },
        { status: 500 }
      );
    }

    // Upload to R2 server-side — no browser CORS needed
    const key = `photos/${sessionId}.jpg`;
    const body = Buffer.from(arrayBuffer);

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: "image/jpeg",
        ContentLength: body.length,
        Metadata: { source: "trump-mosaic" },
      })
    );

    // Mark purchase as uploaded and store the public URL
    const publicUrl = photoPublicUrl(key);
    const { error: updateError } = await db
      .from("purchases")
      .update({
        photo_uploaded: true,
        photo_key: key,
        photo_url: publicUrl,
        uploaded_at: new Date().toISOString(),
      })
      .eq("stripe_session_id", sessionId)
      .eq("photo_uploaded", false);

    if (updateError) {
      console.error("[upload] DB update:", JSON.stringify(updateError));
      return Response.json({ error: "Could not record upload." }, { status: 500 });
    }

    return Response.json({ ok: true, photo_url: publicUrl });
  } catch (err) {
    console.error("[upload] unexpected error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
