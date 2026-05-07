// PATCH /api/business/products/[id]
// status / notes / iconEmoji / colorHex 갱신.
// 칸반에서 사용자가 status 변경할 때 호출.

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";

const ALLOWED_STATUSES = new Set([
  "idea",
  "active",
  "paused",
  "archived",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: {
    status?: string;
    notes?: string;
    iconEmoji?: string | null;
    colorHex?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json(
        {
          error: "invalid_status",
          allowed: Array.from(ALLOWED_STATUSES),
        },
        { status: 400 },
      );
    }
    patch.status = body.status;
  }
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (body.iconEmoji !== undefined) patch.iconEmoji = body.iconEmoji;
  if (body.colorHex !== undefined) patch.colorHex = body.colorHex;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const [row] = await db
    .update(products)
    .set(patch)
    .where(eq(products.id, id))
    .returning({
      id: products.id,
      slug: products.slug,
      status: products.status,
    });

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ product: row });
}
