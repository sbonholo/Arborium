import { photoPublicUrl } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

export async function POST(request: Request) {
  try {
    const { session_id, key } = await request.json();

    if (!session_id || !key) {
      return Response.json({ error: "Missing session_id or key." }, { status: 400 });
    }

    // Verify the key matches what we'd have issued for this session
    // (prevents a user from confirming someone else's key)
    const expectedPrefix = `photos/${session_id}.`;
    if (!key.startsWith(expectedPrefix)) {
      return Response.json({ error: "Key mismatch." }, { status: 403 });
    }

    const publicUrl = photoPublicUrl(key);

    const { error } = await db
      .from("purchases")
      .update({
        photo_uploaded: true,
        photo_key: key,
        photo_url: publicUrl,
        uploaded_at: new Date().toISOString(),
      })
      .eq("stripe_session_id", session_id)
      .eq("photo_uploaded", false); // prevent overwriting an already-confirmed upload

    if (error) {
      console.error("[upload/confirm]", error);
      return Response.json({ error: "Database update failed." }, { status: 500 });
    }

    return Response.json({ ok: true, photo_url: publicUrl });
  } catch (err) {
    console.error("[upload/confirm]", err);
    return Response.json({ error: "Server error." }, { status: 500 });
  }
}
