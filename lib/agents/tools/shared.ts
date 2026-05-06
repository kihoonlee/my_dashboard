// 모든 agent가 공유하는 ask_agent tool.
// agents.toolPermissions.call_agents에 등록된 영문명만 호출 가능.
// 호출 깊이는 invoke route handler에서 헤더(x-myhub-agent-depth)로 enforce.

import type { AgentTool } from "@/lib/anthropic/client";
import { db } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const KOREAN_NAMES: Record<string, string> = {
  hyewon: "혜원 (오케스트레이터)",
  hayoung: "하영 (오늘 매니저)",
  soomin: "수민 (목표 코치)",
  seoyeon: "서연 (지식 사서)",
  dasom: "다솜 (캡처 비서)",
  hyunju: "현주 (사업 매니저)",
  doyeon: "도연 (개발 도구)",
  minyoung: "민영 (뉴스 큐레이터)",
  jeongyeon: "정연 (메일 정리자)",
  minji: "민지 (메타 챗봇)",
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
    description: `다른 AI Agent에게 위임 질문. 호출 가능한 Agent:\n${list}\n\n사용자 요청을 자연어 그대로 'message'에 넣어 전달하면 해당 Agent가 자기 도구로 처리한 결과 텍스트를 반환한다. 도메인이 명확할 때(오늘 일정/Todo → hayoung, 일일 종합 브리핑 → hyewon 등)만 사용. 단순 정보는 직접 답하라.`,
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
 */
export async function runAskAgent(
  callerEnglishName: string,
  callerDepth: number,
  input: Record<string, unknown>,
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

  // 내부 invoke route를 호출. NEXT_PUBLIC_APP_URL을 base로 사용.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const url = `${baseUrl}/api/agents/${targetAgent}/invoke`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-myhub-agent-depth": String(callerDepth + 1),
        // 내부 호출은 proxy.ts 인증 우회를 위해 server-side fetch 후 server runtime의
        // 쿠키 컨텍스트 통과 — Next 16에서는 같은 origin에 fetch 시 cookies가 없으므로
        // proxy가 reject할 수 있다. depth 헤더가 있으면 proxy가 통과시키도록 추가 분기 필요.
        "x-myhub-internal-call": "1",
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
