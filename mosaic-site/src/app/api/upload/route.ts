import { supabaseAdmin } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storage = (supabaseAdmin as any).storage;

const BUCKET = "mosaic-photos";
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
      .select("id, photo_uploaded, cell_indices")
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

    // Ensure the storage bucket exists (idempotent — ignores "already exists" error)
    await storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ["image/jpeg"] });

    // Upload to Supabase Storage
    const path = `photos/${sessionId}.jpg`;
    const body = Buffer.from(arrayBuffer);

    const { error: uploadError } = await storage
      .from(BUCKET)
      .upload(path, body, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      console.error("[upload] Storage upload error:", JSON.stringify(uploadError));
      return Response.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
    }

    // Build the public URL
    const { data: urlData } = storage.from(BUCKET).getPublicUrl(path);
    const publicUrl: string = urlData.publicUrl;

    // Mark purchase as uploaded
    const { error: updateError } = await db
      .from("purchases")
      .update({
        photo_uploaded: true,
        photo_key: path,
        photo_url: publicUrl,
        uploaded_at: new Date().toISOString(),
      })
      .eq("stripe_session_id", sessionId)
      .eq("photo_uploaded", false);

    if (updateError) {
      console.error("[upload] DB update:", JSON.stringify(updateError));
      return Response.json({ error: "Could not record upload." }, { status: 500 });
    }

    return Response.json({
      ok: true,
      photo_url: publicUrl,
      cell_indices: purchase.cell_indices as number[] | null,
    });
  } catch (err) {
    console.error("[upload] unexpected error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
