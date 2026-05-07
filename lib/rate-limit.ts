// 간단 in-memory rate limiter (1인용 기준).
// 다중 사용자 + 다중 인스턴스 환경에서는 Upstash Redis 같은 외부 store로 교체.
//
// 사용:
//   import { rateLimit } from "@/lib/rate-limit";
//   const r = rateLimit("agent-invoke", userId, { perMin: 30, perHour: 300 });
//   if (!r.ok) return NextResponse.json({ error: "rate_limited", retryAfterMs: r.retryAfterMs }, { status: 429 });

type WindowSpec = { windowMs: number; max: number };

type Bucket = {
  windowMs: number;
  max: number;
  hits: number[]; // timestamp ms
};

const STORE = new Map<string, Bucket[]>();

function purge(bucket: Bucket, now: number) {
  const cutoff = now - bucket.windowMs;
  // hits는 시간순. 처음 cutoff 미만인 항목까지 자르기.
  let i = 0;
  while (i < bucket.hits.length && bucket.hits[i] < cutoff) i++;
  if (i > 0) bucket.hits.splice(0, i);
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number; window: string };

/**
 * 다중 윈도우 검사. 가장 빠르게 risque한 윈도우의 retry-after 반환.
 */
export function rateLimit(
  scope: string,
  key: string,
  opts: { perMin?: number; perHour?: number; perDay?: number },
): RateLimitResult {
  const fullKey = `${scope}:${key}`;
  const specs: Array<WindowSpec & { name: string }> = [];
  if (opts.perMin) specs.push({ windowMs: 60_000, max: opts.perMin, name: "minute" });
  if (opts.perHour) specs.push({ windowMs: 3_600_000, max: opts.perHour, name: "hour" });
  if (opts.perDay) specs.push({ windowMs: 86_400_000, max: opts.perDay, name: "day" });
  if (specs.length === 0) return { ok: true, remaining: Infinity };

  let buckets = STORE.get(fullKey);
  if (!buckets || buckets.length !== specs.length) {
    buckets = specs.map((s) => ({ windowMs: s.windowMs, max: s.max, hits: [] }));
    STORE.set(fullKey, buckets);
  }

  const now = Date.now();
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    purge(b, now);
    if (b.hits.length >= b.max) {
      const oldest = b.hits[0];
      const retryAfterMs = oldest + b.windowMs - now;
      return {
        ok: false,
        retryAfterMs: Math.max(0, retryAfterMs),
        window: specs[i].name,
      };
    }
  }
  // 모두 통과 — 모든 버킷에 hit 기록
  for (const b of buckets) b.hits.push(now);
  const minRemaining = Math.min(...buckets.map((b) => b.max - b.hits.length));
  return { ok: true, remaining: minRemaining };
}

/**
 * 메모리 누수 방지 — 주기적으로 호출되지 않는 키 제거.
 * 라이트한 in-memory 환경이라 매 1000 호출마다 GC 시도.
 */
let gcCounter = 0;
export function rateLimitGc() {
  gcCounter++;
  if (gcCounter % 1000 !== 0) return;
  const now = Date.now();
  for (const [key, buckets] of STORE.entries()) {
    const allEmpty = buckets.every((b) => {
      purge(b, now);
      return b.hits.length === 0;
    });
    if (allEmpty) STORE.delete(key);
  }
}
