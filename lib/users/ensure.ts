// Supabase auth user → public.users 매핑 보장.
// public.users.id를 supabase auth user id에 정렬하지 않고 email unique로 매핑.
// (Phase 7 RLS 도입 시 user.id = auth.uid() 정렬로 전환 검토)

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export type SupabaseAuthUserShape = {
  id: string;
  email?: string | null;
  user_metadata?: { full_name?: string; name?: string } | null;
};

export async function ensureUser(
  supabaseUser: SupabaseAuthUserShape,
): Promise<string> {
  const email = supabaseUser.email ?? `${supabaseUser.id}@unknown.local`;
  const name =
    supabaseUser.user_metadata?.full_name ??
    supabaseUser.user_metadata?.name ??
    null;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({ email, name })
    .returning({ id: users.id });
  return created.id;
}
