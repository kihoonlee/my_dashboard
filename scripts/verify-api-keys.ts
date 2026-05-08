// pgcrypto 암복호화 SQL 검증 — server-only import 회피하고 raw SQL로 직접 실행.
// 실행: npx tsx scripts/verify-api-keys.ts

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

async function main() {
  console.log("─".repeat(60));
  console.log("api_keys pgcrypto roundtrip 검증");
  console.log("─".repeat(60));

  const email = process.env.ALLOWED_EMAIL?.trim();
  if (!email) throw new Error("ALLOWED_EMAIL 미설정");

  const key = process.env.OAUTH_TOKEN_KEY;
  if (!key || key.length < 16) {
    throw new Error("OAUTH_TOKEN_KEY 미설정 또는 너무 짧음");
  }

  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!u) {
    throw new Error(
      `user 없음 (ALLOWED_EMAIL=${email}) — /auth/login 한 번 필요`,
    );
  }
  console.log(`✓ user: ${u.email}`);

  // 백업
  const before = await db.execute<{
    value: string;
    masked_tail: string;
    verified_at: Date | null;
  }>(sql`
    SELECT
      pgp_sym_decrypt(decode(encrypted_value, 'base64'), ${key}) AS value,
      masked_tail, verified_at
    FROM api_keys WHERE user_id = ${u.id} AND provider = 'anthropic' LIMIT 1
  `);
  const backup = before[0] ?? null;
  if (backup) console.log(`! 기존 row 백업 (tail ${backup.masked_tail})`);

  const fakeKey = "sk-test-1234567890abcdefXYZ";
  const tail = fakeKey.slice(-4);

  // 저장
  await db.execute(sql`
    INSERT INTO api_keys (user_id, provider, encrypted_value, masked_tail, verified_at, created_at, updated_at)
    VALUES (
      ${u.id}, 'anthropic',
      encode(pgp_sym_encrypt(${fakeKey}, ${key}), 'base64'),
      ${tail}, now(), now(), now()
    )
    ON CONFLICT (user_id, provider) DO UPDATE SET
      encrypted_value = EXCLUDED.encrypted_value,
      masked_tail = EXCLUDED.masked_tail,
      verified_at = EXCLUDED.verified_at,
      updated_at = now()
  `);
  console.log("✓ insert (pgp_sym_encrypt + base64)");

  // 복호화
  const rows = await db.execute<{
    value: string;
    masked_tail: string;
    encrypted_value: string;
  }>(sql`
    SELECT
      pgp_sym_decrypt(decode(encrypted_value, 'base64'), ${key}) AS value,
      masked_tail,
      encrypted_value
    FROM api_keys WHERE user_id = ${u.id} AND provider = 'anthropic' LIMIT 1
  `);
  const row = rows[0];
  if (!row) throw new Error("로드 실패");
  if (row.value !== fakeKey) {
    throw new Error(`복호화 mismatch: ${row.value} vs ${fakeKey}`);
  }
  if (row.masked_tail !== tail) {
    throw new Error(`maskedTail mismatch: ${row.masked_tail}`);
  }
  if (row.encrypted_value === fakeKey || row.encrypted_value.includes(fakeKey)) {
    throw new Error("⚠ encrypted_value에 평문 포함");
  }
  console.log(`✓ roundtrip OK (encrypted '${row.encrypted_value.slice(0, 24)}...', masked '${row.masked_tail}')`);

  // settings_json deep merge 검증
  await db.execute(sql`
    UPDATE users SET settings_json =
      COALESCE(settings_json, '{}'::jsonb)
      || jsonb_build_object(
           'apiKeys',
           COALESCE(settings_json->'apiKeys', '{}'::jsonb)
           || ${JSON.stringify({ anthropic: { savedAt: new Date().toISOString(), maskedTail: tail } })}::jsonb
         )
    WHERE id = ${u.id}
  `);
  const [after] = await db
    .select({ s: users.settingsJson })
    .from(users)
    .where(eq(users.id, u.id))
    .limit(1);
  const apiKeys = (after?.s as Record<string, unknown> | null)?.apiKeys;
  if (!apiKeys || typeof apiKeys !== "object") {
    throw new Error("settings_json.apiKeys merge 실패");
  }
  console.log(`✓ settings_json.apiKeys merge OK: ${JSON.stringify(apiKeys).slice(0, 80)}...`);

  // 다른 settings 키들 보존됐는지 확인
  const allKeys = Object.keys(after?.s ?? {});
  console.log(`✓ settings_json keys 보존: ${allKeys.join(", ")}`);

  // 정리
  await db.execute(sql`
    DELETE FROM api_keys WHERE user_id = ${u.id} AND provider = 'anthropic'
  `);
  if (backup) {
    await db.execute(sql`
      INSERT INTO api_keys (user_id, provider, encrypted_value, masked_tail, verified_at, created_at, updated_at)
      VALUES (
        ${u.id}, 'anthropic',
        encode(pgp_sym_encrypt(${backup.value}, ${key}), 'base64'),
        ${backup.masked_tail},
        ${backup.verified_at ? backup.verified_at.toISOString() + "::timestamptz" : null},
        now(), now()
      )
    `);
    console.log("✓ 백업 row 복구");
  }

  // settings_json.apiKeys.anthropic 청소
  await db.execute(sql`
    UPDATE users SET settings_json =
      COALESCE(settings_json, '{}'::jsonb)
      || jsonb_build_object(
           'apiKeys',
           COALESCE(settings_json->'apiKeys', '{}'::jsonb) - 'anthropic'
         )
    WHERE id = ${u.id}
  `);
  console.log("✓ settings_json.apiKeys.anthropic 정리");

  console.log("─".repeat(60));
  console.log("ALL OK ✓");
}

main().catch((e) => {
  console.error("✗ 검증 실패:", e);
  process.exit(1);
});
