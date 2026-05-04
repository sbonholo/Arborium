import { r2, R2_BUCKET, photoPublicUrl } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// The client resizes to 128×128 JPEG before uploading. 200 KB is a generous cap.
const MAX_PROCESSED_BYTES = 200 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sessionId = formData.get("session_id");
    const file = formData.get("file");

    if (!sessionId || typeof sessionId !== "string") {
      return Response.json({ error: "Missing session_id." }, { status: 400 });
    }
    if (!file || !(file instanceof Blob)) {
      return Response.json({ error: "Missing file." }, { status: 400 });
    }
    if (file.type !== "image/jpeg") {
      return Response.json({ error: "Expected a JPEG (processed client-side)." }, { status: 400 });
    }
    if (file.size > MAX_PROCESSED_BYTES) {
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
      console.error("[upload] DB lookup error:", JSON.stringify(lookupError));
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

    // Upload to R2 directly from the server — no CORS required
    const key = `photos/${sessionId}.jpg`;
    const body = Buffer.from(await file.arrayBuffer());

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

    // Mark purchase as uploaded and record the photo URL
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
      console.error("[upload] DB update error:", JSON.stringify(updateError));
      return Response.json({ error: "Could not record upload." }, { status: 500 });
    }

    return Response.json({ ok: true, photo_url: publicUrl });
  } catch (err) {
    console.error("[upload]", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
