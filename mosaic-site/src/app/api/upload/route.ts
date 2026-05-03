import { createUploadUrl } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// The client resizes to 128×128 JPEG before uploading, so processed files
// are tiny. 200 KB is a very generous upper bound (~6× typical size).
const MAX_PROCESSED_BYTES = 200 * 1024;

export async function POST(request: Request) {
  try {
    const { session_id, file_type, file_size } = await request.json();

    if (!session_id || typeof session_id !== "string") {
      return Response.json({ error: "Missing session_id." }, { status: 400 });
    }
    if (file_type !== "image/jpeg") {
      return Response.json({ error: "Expected a JPEG (processed client-side)." }, { status: 400 });
    }
    if (typeof file_size !== "number" || file_size <= 0 || file_size > MAX_PROCESSED_BYTES) {
      return Response.json(
        { error: `Processed file too large (max ${MAX_PROCESSED_BYTES / 1024} KB).` },
        { status: 400 }
      );
    }

    // Verify purchase exists and hasn't been uploaded yet
    const { data: purchase } = await db
      .from("purchases")
      .select("id, photo_uploaded")
      .eq("stripe_session_id", session_id)
      .maybeSingle();

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

    // All uploads are stored as JPEG (client already converted)
    const key = `photos/${session_id}.jpg`;
    const uploadUrl = await createUploadUrl(key, "image/jpeg");

    return Response.json({ upload_url: uploadUrl, key });
  } catch (err) {
    console.error("[upload]", err);
    return Response.json({ error: "Could not generate upload URL." }, { status: 500 });
  }
}
