import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 서버를 0.0.0.0에 바인딩(LAN 미리보기 + IPv4 강제)하면서
  // 127.0.0.1 / localhost 로 접근하면 Next 16이 cross-origin으로 분류해
  // _next/webpack-hmr 같은 dev 자원을 차단한다. 명시적으로 허용.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
