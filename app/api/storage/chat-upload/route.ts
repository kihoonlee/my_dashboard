// POST /api/storage/chat-upload
//   body: { fileName: string, contentType: string }
//   응답: { signedUrl, storagePath, bucket } — client가 PUT 직접 업로드.
//
// diary bucket 재사용 (path prefix: chat/<userId>/...). 이미지만 지원 (image/* MIME).

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api/auth";

const BUCKET = "diary";
const MAX_SECONDS = 60;
const ALLOWED_MIME_PREFIX = "image/";

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
  const contentType = body.contentType?.trim() ?? "";
  if (!fileName) {
    return NextResponse.json({ error: "fileName required" }, { status: 400 });
  }
  if (!contentType.startsWith(ALLOWED_MIME_PREFIX)) {
    return NextResponse.json(
      { error: "only image/* content types allowed" },
      { status: 400 },
    );
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `chat/${userId}/${Date.now()}-${safeName}`;

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
