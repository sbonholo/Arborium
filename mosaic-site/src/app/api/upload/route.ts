import { r2, R2_BUCKET, photoPublicUrl } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// The client resizes to 128×128 JPEG before uploading. 200 KB is a generous cap.
const MAX_PROCESSED_BYTES = 200 * 1024;

// POST /api/upload?session_id=<id>
// Body: raw JPEG bytes, Content-Type: image/jpeg
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("session_id");
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
