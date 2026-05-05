import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (Client Component, useEffect, onClick).
 * Singleton 아님 — 호출 시마다 새 인스턴스. @supabase/ssr이 내부적으로
 * 같은 storage(cookies)를 공유하므로 세션은 일관됨.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
