// POST /api/storage/diary-upload
//   body: { fileName: string, contentType: string }
//   응답: { signedUrl, storagePath } — client가 PUT 직접 업로드.
//
// Supabase Storage `diary` bucket 가정. RLS: owner-only (auth.uid()).

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";

const BUCKET = "diary";
const MAX_SECONDS = 60;

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: { fileName?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const fileName = body.fileName?.trim();
  const contentType = body.contentType?.trim();
  if (!fileName) {
    return NextResponse.json({ error: "fileName required" }, { status: 400 });
  }

  // 안전한 storage path: <userId>/<timestamp>-<sanitized>
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${userId}/${Date.now()}-${safeName}`;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "signed_url_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
    bucket: BUCKET,
    contentType,
    expiresInSeconds: MAX_SECONDS,
  });
}
