// drizzle-orm raw `sql\`...\`` 템플릿에서 자주 빠뜨리는 캐스팅을 한 곳에 모아둔 헬퍼.
//
// 함정: drizzle/postgres-js raw sql 템플릿은 `${value}`를 그대로 prepared statement 파라미터로
// 바인딩하지만, JS 타입 ↔ Postgres 타입 자동 변환은 매우 제한적이다. 특히:
//   - `Date` 객체를 직접 넘기면 driver 내부에서 `Buffer.from(...)`로 처리하려다
//     `ERR_INVALID_ARG_TYPE` 발생.
//   - drizzle ORM의 객체 빌더(`db.insert(...).values({ts: new Date()})`) 경로는 자동 변환 OK.
//   - raw `sql\`\``에서만 발생하는 함정이라 무의식적으로 반복됨.
//
// 해결: 본 파일의 `tsTz`/`dateLiteral` 사용. ISO 문자열로 변환 후 `::timestamptz` 캐스트를
// 동시에 적용한다. Postgres가 자동으로 정확한 timestamp로 파싱.
//
// 이 헬퍼를 도입한 후 모든 raw sql의 Date 바인딩은 반드시 이걸 통과해야 한다.
//
// 사용 예:
//   import { tsTz } from "@/lib/db/sql-utils";
//   await db.execute(sql`SELECT 1 FROM t WHERE created_at >= ${tsTz(since)}`);

import { sql, type SQL } from "drizzle-orm";

/**
 * Date → `'YYYY-MM-DDTHH:mm:ss.sssZ'::timestamptz` 형식의 SQL fragment.
 * null/undefined를 받으면 `NULL::timestamptz` 반환.
 */
export function tsTz(d: Date | null | undefined): SQL {
  if (!d) return sql`NULL::timestamptz`;
  return sql`${d.toISOString()}::timestamptz`;
}

/**
 * Date → `'YYYY-MM-DD'::date` 형식의 SQL fragment.
 * timezone 무시 (date 컬럼용).
 */
export function dateLiteral(d: Date | null | undefined): SQL {
  if (!d) return sql`NULL::date`;
  const iso = d.toISOString().slice(0, 10);
  return sql`${iso}::date`;
}
