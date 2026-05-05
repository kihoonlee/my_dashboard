// dotenv 로드는 ./client에서 이미 처리됨 (client.ts 상단 참고).
import { db } from "./client";
import { agents } from "./schema";
import { AGENT_SEEDS } from "@/lib/agents/definitions";
import { sql } from "drizzle-orm";

async function seedAgents() {
  console.log(`Seeding ${AGENT_SEEDS.length} agents...`);

  for (const seed of AGENT_SEEDS) {
    await db
      .insert(agents)
      .values({
        name: seed.name,
        englishName: seed.englishName,
        role: seed.role,
        description: seed.description,
        model: seed.model,
        temperature: seed.temperature,
        maxTokens: seed.maxTokens,
        systemPrompt: seed.systemPrompt,
        colorHex: seed.colorHex,
        avatarEmoji: seed.avatarEmoji,
        triggerConfig: seed.triggerConfig,
        toolPermissions: seed.toolPermissions,
        dailyCostLimitUsd: seed.dailyCostLimitUsd,
        monthlyCostLimitUsd: seed.monthlyCostLimitUsd,
      })
      .onConflictDoUpdate({
        target: agents.englishName,
        set: {
          name: seed.name,
          role: seed.role,
          description: seed.description,
          model: seed.model,
          temperature: seed.temperature,
          maxTokens: seed.maxTokens,
          colorHex: seed.colorHex,
          avatarEmoji: seed.avatarEmoji,
          triggerConfig: seed.triggerConfig,
          toolPermissions: seed.toolPermissions,
          dailyCostLimitUsd: seed.dailyCostLimitUsd,
          monthlyCostLimitUsd: seed.monthlyCostLimitUsd,
          updatedAt: sql`now()`,
        },
      });
    console.log(`  ✓ ${seed.name} (${seed.englishName})`);
  }

  console.log(`Done. ${AGENT_SEEDS.length} agents upserted.`);
  process.exit(0);
}

seedAgents().catch((e) => {
  console.error(e);
  process.exit(1);
});
