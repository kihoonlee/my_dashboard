// 모든 agent가 공유하는 ask_agent tool.
// agents.toolPermissions.call_agents에 등록된 영문명만 호출 가능.
// 호출 깊이는 invoke route handler에서 헤더(x-myhub-agent-depth)로 enforce.

import type { AgentTool } from "@/lib/anthropic/client";
import { db } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const KOREAN_NAMES: Record<string, string> = {
  main: "혜원 (메인 비서·CSO·토론 진행)",
  assistant: "민지 (보조·CTO·반대 시각)",
  daily: "하영 (데일리 리포터)",
  diary: "서연 (일기 어시스턴트)",
  memo: "다솜 (메모 어시스턴트)",
  calendar: "수민 (캘린더 어시스턴트)",
};

/**
 * 호출 가능한 agent 목록을 한국어 description에 동적으로 채워서 tool 정의 생성.
 * 권한이 없는 agent는 LLM이 부르더라도 runAskAgent에서 거부.
 */
export function makeAskAgentTool(allowedAgents: string[]): AgentTool | null {
  if (allowedAgents.length === 0) return null;
  const list = allowedAgents
    .map((n) => `  - ${n}: ${KOREAN_NAMES[n] ?? n}`)
    .join("\n");
  return {
    name: "ask_agent",
    description: `다른 AI Agent에게 위임 질문. 호출 가능한 Agent:\n${list}\n\n사용자 요청을 자연어 그대로 'message'에 넣어 전달하면 해당 Agent가 자기 도구로 처리한 결과 텍스트를 반환한다. 도메인이 명확할 때(일기·검색 → diary, 메모·todo 요약 → memo, 캘린더 등록 → calendar)만 사용. 단순 정보는 직접 답하라.`,
    input_schema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          enum: allowedAgents,
          description: "호출할 agent의 영문명",
        },
        message: {
          type: "string",
          description: "해당 agent에게 전달할 메시지 (한국어 OK)",
        },
      },
      required: ["agent", "message"],
    },
  };
}

/**
 * ask_agent tool 실행. callerDepth는 현재 agent의 호출 깊이 (시작은 0).
 * 다음 호출은 callerDepth + 1로 헤더 전달.
 * callerUserId는 사용자 식별자 — 내부 fetch 시 x-myhub-user-id 헤더로 forward해
 * 호출 대상 도구가 user-scoped 쿼리를 수행할 수 있게 한다.
 */
export async function runAskAgent(
  callerEnglishName: string,
  callerDepth: number,
  callerUserId: string,
  input: Record<string, unknown>,
  /** caller invoke route의 self origin — NEXT_PUBLIC_APP_URL 빌드타임 박힘 회피. */
  baseUrl: string,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const targetAgent = typeof input.agent === "string" ? input.agent : "";
  const message = typeof input.message === "string" ? input.message : "";
  if (!targetAgent || !message) {
    return { ok: false, error: "agent and message are required" };
  }

  // 권한 검사 — caller의 toolPermissions.call_agents에 targetAgent 포함 여부
  const [caller] = await db
    .select({ toolPermissions: agents.toolPermissions })
    .from(agents)
    .where(eq(agents.englishName, callerEnglishName))
    .limit(1);
  if (!caller) return { ok: false, error: `caller ${callerEnglishName} not found` };
  const callAgents =
    (caller.toolPermissions as { call_agents?: string[] } | null)?.call_agents ??
    [];
  if (!callAgents.includes(targetAgent)) {
    return {
      ok: false,
      error: `permission_denied: ${callerEnglishName} cannot call ${targetAgent}`,
    };
  }

  // 자기 자신 호출 금지
  if (targetAgent === callerEnglishName) {
    return { ok: false, error: "self-invocation not allowed" };
  }

  // 호출 대상이 비활성/일시정지면 LLM 호출 없이 즉시 거부 (환각 방지).
  // 호출자는 이 메시지를 그대로 사용자에게 전달해야 한다 — 절대 가상 데이터로 채우지 말 것.
  const [target] = await db
    .select({
      isActive: agents.isActive,
      isPausedReason: agents.isPausedReason,
    })
    .from(agents)
    .where(eq(agents.englishName, targetAgent))
    .limit(1);
  if (!target) {
    return { ok: false, error: `target agent ${targetAgent} not found` };
  }
  if (!target.isActive) {
    const reason = target.isPausedReason
      ? `비활성: ${target.isPausedReason}`
      : "현재 비활성 상태(데이터 미연동)";
    return {
      ok: true,
      result: {
        text: `[${targetAgent}] ${reason}. 데이터가 없어 답변할 수 없습니다. 절대 가상 데이터로 채우지 말고 이 사실을 사용자에게 그대로 알리세요.`,
        costUsd: 0,
      },
    };
  }

  // 내부 invoke route를 호출. baseUrl은 caller가 self origin으로 넘김.
  const url = `${baseUrl}/api/agents/${targetAgent}/invoke`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-myhub-agent-depth": String(callerDepth + 1),
        // 내부 호출은 proxy.ts 인증 우회를 위한 플래그.
        "x-myhub-internal-call": "1",
        // 사용자 식별자 forward — invoke route가 도구에 user-scoped 쿼리용으로 전달.
        "x-myhub-user-id": callerUserId,
      },
      body: JSON.stringify({
        message,
        trigger: `delegated_by_${callerEnglishName}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: `${data.error ?? res.statusText}` };
    }
    return { ok: true, result: { text: data.text, costUsd: data.costUsd } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `fetch failed: ${message}` };
  }
}
