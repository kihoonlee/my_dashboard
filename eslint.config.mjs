import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // git worktree들이 갖는 자체 .next 빌드 캐시도 제외 — 그 안의 chunks는
    // 우리 소스가 아니라 turbopack 산출물이라 lint 의미 없음.
    ".claude/**",
  ]),
  // React 19의 react-hooks/set-state-in-effect rule은 useCallback으로 감싼 함수
  // 호출까지 전이적으로 잡아내 false positive가 많다. data-fetch in useEffect는
  // React docs도 공식 패턴으로 인정하는 것이라 warn으로만 표시.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
