// 구조화 에러 로깅 + 선택적 Sentry hook.
// SENTRY_DSN 미설정 시 console.error만. 설정 시 Sentry SDK가 별도 설치되어 있다면 전송.
// (Sentry SDK 설치는 사용자 결정 영역 — 여기서는 hook 형태만)

import "server-only";

type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  scope: string;
  message: string;
  attributes?: Record<string, unknown>;
  error?: Error;
};

/**
 * 구조화 로그 — JSON 한 줄로 stderr에 출력 (Vercel Logs / log drain 친화적).
 * dev에서는 사람이 읽기 쉬운 포맷.
 */
export function logEvent(entry: LogEntry): void {
  const ts = new Date().toISOString();
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    // 프로덕션: JSON line
    const payload = {
      ts,
      level: entry.level,
      scope: entry.scope,
      message: entry.message,
      ...(entry.attributes ?? {}),
      ...(entry.error
        ? {
            error: {
              name: entry.error.name,
              message: entry.error.message,
              stack: entry.error.stack,
            },
          }
        : {}),
    };
    const stream = entry.level === "error" ? console.error : console.log;
    stream(JSON.stringify(payload));
  } else {
    // dev: 가독성
    const tag = `[${entry.scope}]`;
    const msg = `${tag} ${entry.message}`;
    if (entry.level === "error") {
      console.error(msg, entry.attributes ?? "", entry.error ?? "");
    } else if (entry.level === "warn") {
      console.warn(msg, entry.attributes ?? "");
    } else {
      console.log(msg, entry.attributes ?? "");
    }
  }

  // Sentry hook — SDK 설치돼 있으면 캡처 (전역 객체 검사 — peer 의존성 안 만듦)
  if (entry.level === "error" && entry.error) {
    sendToSentry(entry.error, entry);
  }
}

function sendToSentry(err: Error, entry: LogEntry) {
  // @ts-expect-error: Sentry SDK가 글로벌에 설치되어 있을 때만 동작.
  const Sentry = globalThis.Sentry as
    | { captureException?: (e: unknown, ctx?: unknown) => void }
    | undefined;
  if (!Sentry?.captureException) return;
  if (!process.env.SENTRY_DSN) return;
  try {
    Sentry.captureException(err, {
      tags: { scope: entry.scope },
      extra: entry.attributes,
    });
  } catch {
    // sentry 자체 실패는 무시
  }
}

/**
 * 라우트 핸들러에서 catch한 에러를 안전하게 응답으로 반환하는 헬퍼.
 * { error, message } 형태의 JSON. status 500 default.
 */
export function jsonError(
  scope: string,
  err: unknown,
  status: number = 500,
  attributes?: Record<string, unknown>,
): { body: { error: string; message: string }; status: number } {
  const error = err instanceof Error ? err : new Error(String(err));
  logEvent({
    level: "error",
    scope,
    message: error.message,
    attributes,
    error,
  });
  return {
    body: { error: scope, message: error.message },
    status,
  };
}
