import { createUploadUrl } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

export async function POST(request: Request) {
  try {
    const { session_id, file_type, file_size } = await request.json();

    if (!session_id || typeof session_id !== "string") {
      return Response.json({ error: "Missing session_id." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file_type)) {
      return Response.json({ error: "Only JPEG, PNG, or WebP images are allowed." }, { status: 400 });
    }
    if (!file_size || file_size > MAX_BYTES) {
      return Response.json({ error: "File too large. Maximum size is 10 MB." }, { status: 400 });
    }

    // Verify purchase exists and hasn't been uploaded yet
    const { data: purchase } = await db
      .from("purchases")
      .select("id, photo_uploaded")
      .eq("stripe_session_id", session_id)
      .maybeSingle();

    if (!purchase) {
      return Response.json({ error: "Purchase not found. Make sure payment completed." }, { status: 404 });
    }
    if (purchase.photo_uploaded) {
      return Response.json({ error: "A photo has already been uploaded for this purchase." }, { status: 409 });
    }

    const ext = file_type === "image/png" ? "png" : file_type === "image/webp" ? "webp" : "jpg";
    const key = `photos/${session_id}.${ext}`;

    const uploadUrl = await createUploadUrl(key, file_type);

    return Response.json({ upload_url: uploadUrl, key });
  } catch (err) {
    console.error("[upload]", err);
    return Response.json({ error: "Could not generate upload URL." }, { status: 500 });
  }
}
