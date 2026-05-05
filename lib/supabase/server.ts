import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client (RSC, Server Action, Route Handler).
 * 쿠키에서 세션을 읽고 갱신한다. Next 15+에서 cookies()는 async.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component 안에서 호출되면 set이 throw할 수 있음.
            // proxy.ts에서 세션 갱신을 처리하므로 여기서는 무시해도 안전.
          }
        },
      },
    },
  );
}
