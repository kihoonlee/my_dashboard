import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 서버를 0.0.0.0에 바인딩(LAN 미리보기 + IPv4 강제)하면서
  // 127.0.0.1 / localhost 로 접근하면 Next 16이 cross-origin으로 분류해
  // _next/webpack-hmr 같은 dev 자원을 차단한다. 명시적으로 허용.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // 빌드 시 console.log 제거 (error/warn은 유지). 프로덕션 번들 사이즈 감소.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  // 정적 자원 캐싱 + 보안 헤더.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // 모듈 import 최적화 — lucide-react 같이 큰 라이브러리에서 사용한 아이콘만 import.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
