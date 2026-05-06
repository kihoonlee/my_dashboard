// 사용자가 실제로 접근한 origin을 그대로 보존하기 위한 헬퍼.
// next dev -H 0.0.0.0 으로 listen하면 request.url의 host가 0.0.0.0이 되는데,
// 사용자가 127.0.0.1로 접근한 상태에서 redirect Location이 0.0.0.0으로 떨어지면
// supabase auth cookie scope가 깨진다 (다른 host로 인식). Host 헤더 기준으로 빌드.

import type { NextRequest } from "next/server";

export function requestOrigin(request: NextRequest): string {
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "") ??
    "http";
  const host = request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}

export function absoluteUrl(request: NextRequest, path: string): URL {
  return new URL(path, requestOrigin(request));
}
